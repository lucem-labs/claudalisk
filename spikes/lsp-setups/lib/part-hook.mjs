import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { caseFolder, copyFresh } from '../../lsp-host/lib/fixture.mjs'
import { removeApp } from '../../lsp-host/lib/runner.mjs'
import { DIAGNOSTIC_CASES, prepareApp, writeCase } from './cases.mjs'
import { DEFAULT_DEADLINE_MS } from '../post-edit-hook.mjs'
import { endpointFor, isAbsent, request } from './daemon-protocol.mjs'
import { LANGUAGES } from './setups.mjs'
import { log, now, sleep, spikeDirectory, summarizeValues } from './common.mjs'

const hookScript = join(spikeDirectory, 'post-edit-hook.mjs')

const EXPECTED = {
  csharp: /CS0103|unitt/,
  typescript: /2339|amountt/,
  yaml: /runs-on|stepz|not allowed|Missing property/i,
}

export function runHook(app, language, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
  const input = { tool_name: 'Edit', tool_input: { file_path: join(app, DIAGNOSTIC_CASES[language].file) }, cwd: app, hook_event_name: 'PostToolUse' }
  const started = now()
  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, CLAUDALISK_LSP_HOOK_DEADLINE_MS: String(deadlineMs) },
    timeout: deadlineMs + 20000,
  })
  const wallMs = now() - started
  const output = (result.stdout ?? '').trim()
  let context = ''
  if (output) {
    try {
      context = JSON.parse(output).hookSpecificOutput.additionalContext
    } catch {
      context = `unparseable: ${output.slice(0, 200)}`
    }
  }
  return { wallMs, status: result.status, printed: output.length > 0, context }
}

async function stopDaemon(app) {
  const endpoint = endpointFor(app)
  try {
    await request(endpoint, { method: 'shutdown' }, { timeoutMs: 5000 })
  } catch (error) {
    if (!isAbsent(error)) return
  }
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    try {
      await request(endpoint, { method: 'status' }, { timeoutMs: 500 })
      await sleep(200)
    } catch {
      return
    }
  }
}

async function coldRun(app, language) {
  await stopDaemon(app)
  writeCase(app, language, 'broken')
  const full = runHook(app, language, { deadlineMs: 240000 })
  const fullOk = EXPECTED[language].test(full.context)
  await stopDaemon(app)
  const started = now()
  let misses = 0
  let firstOutputMs = null
  let runs = 0
  while (now() - started < 180000) {
    runs++
    const run = runHook(app, language)
    if (run.printed && EXPECTED[language].test(run.context)) {
      firstOutputMs = Math.round(now() - started)
      break
    }
    misses++
  }
  return { fullWaitMs: Math.round(full.wallMs), fullCorrect: fullOk, defaultDeadlineMs: DEFAULT_DEADLINE_MS, missesBeforeFirstOutput: misses, runsUntilFirstOutput: runs, firstOutputMs }
}

async function warmRuns(app, language, count) {
  const times = []
  let correct = 0
  const runs = []
  for (let i = 0; i < count; i++) {
    const broken = i % 2 === 0
    writeCase(app, language, broken ? 'broken' : 'good')
    const run = runHook(app, language)
    const right = broken ? run.printed && EXPECTED[language].test(run.context) : !run.printed
    if (right) correct++
    times.push(run.wallMs)
    runs.push({ broken, wallMs: Math.round(run.wallMs), printed: run.printed, right })
  }
  const stats = summarizeValues(times)
  return { ...stats, correct, count, recommendedDeadlineMs: Math.ceil((stats.p95Ms * 2) / 100) * 100, runs: runs.slice(0, 6) }
}

export async function hookPart({ base, work, coldRepeats = 3, warmCount = 14 }) {
  const out = { defaultDeadlineMs: DEFAULT_DEADLINE_MS, languages: {} }
  for (const language of LANGUAGES) {
    const app = copyFresh(base, caseFolder(work, `hook-${language}`))
    prepareApp(app)
    const entry = { cold: [], warm: null }
    out.languages[language] = entry
    log(`hook ${language}`)
    try {
      for (let i = 0; i < coldRepeats; i++) entry.cold.push(await coldRun(app, language))
      await stopDaemon(app)
      writeCase(app, language, 'broken')
      const prime = runHook(app, language, { deadlineMs: 240000 })
      entry.primeWallMs = Math.round(prime.wallMs)
      entry.warm = await warmRuns(app, language, warmCount)
      entry.coldMissRate = entry.cold.length ? entry.cold.reduce((sum, c) => sum + (c.missesBeforeFirstOutput > 0 ? 1 : 0), 0) / entry.cold.length : null
    } catch (error) {
      entry.error = String(error.message ?? error).slice(0, 500)
    } finally {
      await stopDaemon(app).catch(() => {})
      removeApp(app)
    }
  }
  return out
}
