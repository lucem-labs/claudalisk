import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeArguments, stagePlugin } from './arms.mjs'
import { cloneFixture, readFixture } from './fixture-repo.mjs'
import { git, ledgerFile, runCaptured } from './lib.mjs'
import { RUN_CAP_USD, addRun, assertRoom, readLedger, room, writeLedger } from './ledger.mjs'
import { accepted, installHidden, loadTask, runChecks } from './tasks.mjs'
import { completed, parseStream, summarizeRun } from './usage.mjs'

export const RUN_TIMEOUT_MS = 60 * 60 * 1000

export function claudeBinary(env = process.env) {
  return env.CLAUDE_BIN || 'claude'
}

export function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

export function nextRunNumber(resultsDir, arm, task) {
  const folder = join(resultsDir, arm)
  if (!existsSync(folder)) return 1
  const numbers = readdirSync(folder)
    .map((name) => new RegExp(`^[^-]+-${task}-(\\d+)\\.json$`).exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
  return Math.max(0, ...numbers) + 1
}

export function plan({ tasks, runs, resultsDir, arm }) {
  const next = Object.fromEntries(tasks.map((task) => [task, nextRunNumber(resultsDir, arm, task)]))
  const steps = []
  for (let repeat = 0; repeat < runs; repeat += 1) {
    for (const task of tasks) steps.push({ task, run: next[task] + repeat })
  }
  return steps
}

export function describePlan({ arm, steps, ledger }) {
  const worst = steps.length * RUN_CAP_USD
  const lines = [
    `Arm ${arm.name}: model ${arm.model}, plugin ${arm.pluginDir}, settings ${arm.settings}`,
    `${steps.length} runs, each capped at $${RUN_CAP_USD.toFixed(2)}, so at most $${worst.toFixed(2)}:`,
    ...steps.map((step) => `  ${step.task} run ${step.run}`),
    `Ledger: $${ledger.spentUsd.toFixed(2)} spent of $${ledger.capUsd.toFixed(2)} over ${ledger.runs.length} runs; $${Math.max(0, room(ledger, 0)).toFixed(2)} left.`,
  ]
  if (ledger.spentUsd + worst > ledger.capUsd) {
    const affordable = Math.max(0, Math.floor(room(ledger, 0) / RUN_CAP_USD))
    lines.push(`The worst case would cross the budget; the runner starts at most ${Math.min(affordable, steps.length)} of these and then refuses.`)
  }
  return lines.join('\n')
}

export function copyDependencies(source, copy) {
  const from = join(source, 'frontend', 'node_modules')
  const to = join(copy, 'frontend', 'node_modules')
  if (existsSync(from) && !existsSync(to)) cpSync(from, to, { recursive: true, verbatimSymlinks: true })
}

export async function pluginCommit(pluginDir) {
  try {
    const commit = await git(['rev-parse', 'HEAD'], pluginDir)
    const dirty = (await git(['status', '--porcelain'], pluginDir)).length > 0
    return dirty ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}

export async function runOnce({ arm, task, run, plugin, claudeCommit, fixture, resultsDir, ledgerPath, keep = false, exec = runCaptured, now = () => new Date(), checkRun }) {
  const ledger = readLedger(ledgerPath)
  assertRoom(ledger)
  const base = mkdtempSync(join(tmpdir(), 'claudalisk-bench-run-'))
  const copy = join(base, 'app')
  try {
    await cloneFixture(copy, { fixture })
    copyDependencies(fixture.path, copy)
    const started = Date.now()
    const outcome = await exec(claudeBinary(), claudeArguments({ arm, plugin, budget: RUN_CAP_USD }), { cwd: copy, input: task.prompt, timeoutMs: RUN_TIMEOUT_MS })
    const wallMs = Date.now() - started
    const summary = summarizeRun(parseStream(outcome.stdout), wallMs, outcome)
    installHidden(task, copy)
    const checks = await runChecks(task, copy, checkRun)
    const at = now()
    const record = {
      arm: arm.name,
      task: task.id,
      run,
      at: at.toISOString(),
      claudaliskCommit: claudeCommit,
      fixtureHead: fixture.head,
      model: arm.model,
      totalCostUsd: summary.costUsd,
      models: summary.models,
      turns: summary.turns,
      subagents: summary.subagents,
      wallMs: summary.wallMs,
      isError: summary.isError,
      subtype: summary.subtype,
      completed: completed(summary),
      checks,
      accepted: completed(summary) && accepted(checks),
      ...(outcome.code === 0 ? {} : { exitCode: outcome.code, stderr: outcome.stderr.slice(-1500) }),
    }
    const folder = join(resultsDir, arm.name)
    mkdirSync(folder, { recursive: true })
    const file = `${stamp(at)}-${task.id}-${run}.json`
    writeFileSync(join(folder, file), `${JSON.stringify(record, null, 2)}\n`)
    writeLedger(ledgerPath, addRun(readLedger(ledgerPath), { arm: arm.name, task: task.id, run, file: `${arm.name}/${file}`, costUsd: summary.costUsd, at: record.at }))
    return record
  } finally {
    if (!keep) rmSync(base, { recursive: true, force: true })
    else console.log(`Kept ${base}`)
  }
}

export async function runAll({ arm, tasks, runs, resultsDir, ledgerPath = ledgerFile, keep = false, exec, checkRun, log = console.log, fixture = readFixture(), tasksFolder }) {
  const steps = plan({ tasks, runs, resultsDir, arm: arm.name })
  const plugin = stagePlugin(arm.pluginDir, join(mkdtempSync(join(tmpdir(), 'claudalisk-bench-plugin-')), 'plugin'))
  const claudeCommit = await pluginCommit(arm.pluginDir)
  const records = []
  try {
    for (const step of steps) {
      const task = loadTask(step.task, tasksFolder)
      log(`${arm.name} ${step.task} run ${step.run}`)
      const record = await runOnce({ arm, task, run: step.run, plugin, claudeCommit, fixture, resultsDir, ledgerPath, keep, exec, checkRun })
      records.push(record)
      log(`  ${record.accepted ? 'accepted' : 'rejected'} (${record.subtype}), $${record.totalCostUsd.toFixed(2)}, ${record.turns} turns, ${record.subagents} subagents`)
    }
  } finally {
    rmSync(join(plugin, '..'), { recursive: true, force: true })
  }
  return records
}

export function readResults(resultsDir, arm) {
  const folder = join(resultsDir, arm)
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')))
}
