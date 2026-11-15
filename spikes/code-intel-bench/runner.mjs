import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SETTING_SOURCES, armForModel, claudeArguments, stagePlugin } from './arms.mjs'
import { cloneFixture, readFixture } from './fixture-repo.mjs'
import { git, runCaptured } from './lib.mjs'
import { RUN_CAP_USD, defaultLedgerPath, reserveRun, room, settleRun } from './ledger.mjs'
import { accepted, installHidden, loadTask, runChecks } from './tasks.mjs'
import { completed, parseStream, summarizeRun } from './usage.mjs'

export const RUN_TIMEOUT_MS = 60 * 60 * 1000

export function claudeBinary(env = process.env) {
  return env.CLAUDE_BIN || 'claude'
}

export function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

export function repeatsDone(resultsDir, arm, model) {
  const done = {}
  for (const record of readResults(resultsDir, arm, model)) {
    const repeat = record.repeat ?? record.run
    ;(done[record.task] ??= new Set()).add(repeat)
  }
  return done
}

export function plan({ tasks, runs, resultsDir, arm, model }) {
  const done = repeatsDone(resultsDir, arm, model)
  const steps = []
  let repeat = 0
  for (let pass = 0; pass < runs; pass += 1) {
    do repeat += 1
    while (tasks.every((task) => done[task]?.has(repeat)))
    for (const task of tasks) if (!done[task]?.has(repeat)) steps.push({ task, repeat })
  }
  return steps
}

export function describePlan({ arm, steps, ledger, pack }) {
  const worst = steps.length * RUN_CAP_USD
  const lines = [
    ...(pack ? [`Pack ${pack}`] : []),
    `Arm ${arm.name} on ${arm.model}: plugin ${arm.pluginDir}, settings ${arm.settings}`,
    `${steps.length} runs, each capped at $${RUN_CAP_USD.toFixed(2)}, so at most $${worst.toFixed(2)}:`,
    ...steps.map((step) => `  ${step.task} repeat ${step.repeat}`),
    `Ledger: $${ledger.spentUsd.toFixed(2)} spent of $${ledger.capUsd.toFixed(2)} over ${ledger.runs.length} runs; $${Math.max(0, room(ledger, 0)).toFixed(2)} left.`,
  ]
  if (ledger.spentUsd + worst > ledger.capUsd) {
    const affordable = Math.max(0, Math.floor(room(ledger, 0) / RUN_CAP_USD))
    lines.push(`The worst case would cross the budget; the runner starts at most ${Math.min(affordable, steps.length)} of these and then refuses.`)
  }
  return lines.join('\n')
}

export function copyDependencies(source, copy, dependencies = ['frontend/node_modules']) {
  for (const folder of dependencies) {
    const from = join(source, ...folder.split('/'))
    const to = join(copy, ...folder.split('/'))
    if (existsSync(from) && !existsSync(to)) cpSync(from, to, { recursive: true, verbatimSymlinks: true })
  }
}

export async function pluginCommit(pluginDir) {
  try {
    const commit = await git(['rev-parse', 'HEAD'], pluginDir)
    const dirty = (await git(['status', '--porcelain', '--', '.', ':!spikes'], pluginDir)).length > 0
    return dirty ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}

export async function runOnce({ arm, task, repeat, pack, plugin, claudeCommit, fixture, resultsDir, ledgerPath, keep = false, exec = runCaptured, now = () => new Date(), checkRun }) {
  const reservation = reserveRun(ledgerPath, { arm: arm.name, model: arm.model, ...(pack ? { pack } : {}), task: task.id, repeat, at: now().toISOString() })
  const base = mkdtempSync(join(tmpdir(), 'claudalisk-bench-run-'))
  const copy = join(base, 'app')
  try {
    await cloneFixture(copy, { fixture })
    copyDependencies(fixture.path, copy, fixture.dependencies)
    const started = Date.now()
    const args = claudeArguments({ arm, plugin, budget: RUN_CAP_USD })
    const outcome = await exec(claudeBinary(), args, { cwd: copy, input: task.prompt, timeoutMs: RUN_TIMEOUT_MS })
    const wallMs = Date.now() - started
    const summary = summarizeRun(parseStream(outcome.stdout), wallMs, outcome)
    const at = now()
    let record = {
      arm: arm.name,
      task: task.id,
      repeat,
      at: at.toISOString(),
      claudaliskCommit: claudeCommit,
      fixtureHead: fixture.head,
      model: arm.model,
      settingSources: SETTING_SOURCES,
      claudeArguments: args,
      totalCostUsd: summary.costUsd,
      ...(summary.costEstimated ? { costEstimated: true } : {}),
      models: summary.models,
      turns: summary.turns,
      subagents: summary.subagents,
      wallMs: summary.wallMs,
      isError: summary.isError,
      subtype: summary.subtype,
      completed: completed(summary),
      checks: [],
      checksPending: true,
      accepted: false,
      ...(outcome.code === 0 ? {} : { exitCode: outcome.code, stderr: outcome.stderr.slice(-1500) }),
    }
    const folder = join(resultsDir, arm.name, arm.model)
    mkdirSync(folder, { recursive: true })
    const file = `${stamp(at)}-${task.id}-${repeat}.json`
    const save = () => writeFileSync(join(folder, file), `${JSON.stringify(record, null, 2)}
`)
    save()
    settleRun(ledgerPath, reservation, { file: `${arm.name}/${arm.model}/${file}`, costUsd: summary.costUsd, at: record.at })
    installHidden(task, copy)
    const checks = await runChecks(task, copy, checkRun)
    const { checksPending, ...rest } = record
    record = { ...rest, checks, accepted: completed(summary) && accepted(checks) }
    save()
    return record
  } finally {
    if (!keep) rmSync(base, { recursive: true, force: true })
    else console.log(`Kept ${base}`)
  }
}

export async function runAll({ arm, tasks, runs, resultsDir, ledgerPath = defaultLedgerPath(), keep = false, exec, checkRun, log = console.log, fixture = readFixture(), tasksFolder, pack }) {
  const steps = plan({ tasks, runs, resultsDir, arm: arm.name, model: arm.model })
  const plugin = stagePlugin(arm.pluginDir, join(mkdtempSync(join(tmpdir(), 'claudalisk-bench-plugin-')), 'plugin'))
  const claudeCommit = await pluginCommit(arm.pluginDir)
  const records = []
  try {
    for (const step of steps) {
      const task = loadTask(step.task, tasksFolder)
      log(`${arm.name} ${arm.model} ${step.task} repeat ${step.repeat}`)
      const record = await runOnce({ arm, task, repeat: step.repeat, pack, plugin, claudeCommit, fixture, resultsDir, ledgerPath, keep, exec, checkRun })
      records.push(record)
      log(`  ${record.accepted ? 'accepted' : 'rejected'} (${record.subtype}), $${record.totalCostUsd.toFixed(2)}, ${record.turns} turns, ${record.subagents} subagents`)
    }
  } finally {
    rmSync(join(plugin, '..'), { recursive: true, force: true })
  }
  return records
}

export function readResults(resultsDir, arm, model) {
  const folder = join(resultsDir, arm, model)
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')))
}
