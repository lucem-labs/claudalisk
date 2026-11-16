import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { READY, locationKeys } from '../../lsp-host/lib/runner.mjs'
import { normalizeDiagnostic } from './host-server.mjs'
import { now, sleep, summarizeValues } from './common.mjs'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

export const WORKFLOW = '.github/workflows/lsp-case.yml'

const replaceOnce = (text, from, to) => {
  if (!text.includes(from)) throw new Error(`"${from}" is not in the file`)
  return text.replace(from, to)
}

const codeOf = (diagnostic) => String(diagnostic.code && typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code)

export const DIAGNOSTIC_CASES = {
  csharp: {
    file: 'backend/Proof.LspCases/Pricing.cs',
    describe: 'an undefined name in a C# file',
    expected: 'CS0103, the name does not exist',
    broken: (text) => replaceOnce(text, 'quantity * unit;', 'quantity * unitt;'),
    matches: (diagnostic) => codeOf(diagnostic) === 'CS0103' || /unitt/.test(diagnostic.message),
  },
  typescript: {
    file: 'frontend/src/shared/lib/price/format-price.ts',
    describe: 'a type error in a TypeScript file',
    expected: 'TS2339, the property does not exist',
    broken: (text) => replaceOnce(text, 'price.amount.toFixed', 'price.amountt.toFixed'),
    matches: (diagnostic) => codeOf(diagnostic) === '2339' || /amountt/.test(diagnostic.message),
  },
  yaml: {
    file: WORKFLOW,
    describe: 'a workflow with a misspelt key and no runs-on',
    expected: 'a schema error on the missing runs-on or the unknown key',
    broken: () => readFileSync(join(fixtures, 'workflow-broken.yml'), 'utf8'),
    matches: (diagnostic) => /runs-on|stepz|not allowed|Missing property/i.test(diagnostic.message),
  },
}

export function prepareApp(app) {
  const path = join(app, WORKFLOW)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, readFileSync(join(fixtures, 'workflow-good.yml'), 'utf8'))
}

const goodTexts = new Map()

export function writeCase(app, language, state) {
  const definition = DIAGNOSTIC_CASES[language]
  const path = join(app, definition.file)
  const key = path
  if (!goodTexts.has(key)) goodTexts.set(key, readFileSync(path, 'utf8'))
  const good = goodTexts.get(key)
  writeFileSync(path, state === 'broken' ? definition.broken(good) : good)
}

export const hasMatch = (language) => (diagnostics) => diagnostics.some(DIAGNOSTIC_CASES[language].matches)
export const lacksMatch = (language) => (diagnostics) => !diagnostics.some(DIAGNOSTIC_CASES[language].matches)

const describeDiagnostics = (diagnostics) =>
  diagnostics
    .slice(0, 6)
    .map(normalizeDiagnostic)
    .map((d) => `${d.severity} ${d.code} ${d.message}`.slice(0, 200))

function stalenessOf(seen, matches, want) {
  const unwanted = seen.filter((push) => (want === 'match' ? !push.diagnostics.some(matches) : push.diagnostics.some(matches)))
  return { pushes: seen.length, stale: unwanted.length, empty: seen.filter((push) => push.diagnostics.length === 0).length }
}

export async function waitReady(client, language, { timeoutMs = 300000, log = () => {} } = {}) {
  const started = now()
  if (language === 'yaml') {
    const file = DIAGNOSTIC_CASES.yaml.file
    client.open(file)
    if (typeof client.waitPush === 'function') await client.waitPush(file, 0, () => true, 20000)
    else await sleep(2000)
    return { ms: Math.round(now() - started), attempts: 1 }
  }
  const probe = READY[language]
  const expectedKey = [...probe.expected].sort().join(',')
  const deadline = Date.now() + timeoutMs
  let attempts = 0
  let confirmed = 0
  let last
  while (Date.now() < deadline) {
    attempts++
    try {
      const answer = locationKeys(await client.references(probe.file, probe.needle))
      last = answer
      confirmed = answer === expectedKey ? confirmed + 1 : 0
      if (confirmed >= 2) return { ms: Math.round(now() - started), attempts }
    } catch (error) {
      last = error.message
      confirmed = 0
      if (client.client?.exited) throw error
    }
    await sleep(200)
  }
  log(`not ready after ${timeoutMs} ms, last answer ${String(last).slice(0, 300)}`)
  return { ms: null, attempts, last: String(last).slice(0, 400) }
}

async function pushStep(client, language, { relative, want, waitMs }) {
  const predicate = want === 'match' ? hasMatch(language) : lacksMatch(language)
  const matches = DIAGNOSTIC_CASES[language].matches
  const mark = client.mark()
  const sentAt = now()
  client.change(relative)
  const viaChange = await client.waitPush(relative, mark, predicate, waitMs, sentAt)
  const step = { viaChangeMs: viaChange.found ? Math.round(viaChange.ms) : null, viaSaveMs: null, found: viaChange.found }
  if (!viaChange.found) {
    const saveMark = client.mark()
    const savedAt = now()
    client.save(relative)
    const viaSave = await client.waitPush(relative, saveMark, predicate, waitMs, savedAt)
    step.viaSaveMs = viaSave.found ? Math.round(viaSave.ms) : null
    step.found = viaSave.found
  }
  Object.assign(step, stalenessOf(client.pushesSince(relative, mark), matches, want))
  step.lastPush = describeDiagnostics(client.pushesSince(relative, mark).at(-1)?.diagnostics ?? [])
  return step
}

export async function runPushCase(client, app, language, { repeats = 5, waitMs = 20000 } = {}) {
  const relative = DIAGNOSTIC_CASES[language].file
  writeCase(app, language, 'good')
  client.open(relative)
  await sleep(300)
  const reps = []
  for (let i = 0; i < repeats; i++) {
    writeCase(app, language, 'broken')
    const broken = await pushStep(client, language, { relative, want: 'match', waitMs })
    writeCase(app, language, 'good')
    const fixed = await pushStep(client, language, { relative, want: 'clear', waitMs })
    reps.push({ broken, fixed })
  }
  return summarizeReps(reps, 'push')
}

async function pullStep(server, language, { relative, want, waitMs, intervalMs = 50 }) {
  const predicate = want === 'match' ? hasMatch(language) : lacksMatch(language)
  const sentAt = now()
  const deadline = sentAt + waitMs
  let polls = 0
  let first
  for (;;) {
    polls++
    const result = await server.diagnostics(relative, { pushWaitMs: Math.min(waitMs, 4000) })
    first ??= { ms: Math.round(now() - sentAt), count: result.diagnostics.length }
    const found = predicate(result.diagnostics)
    if (found || now() >= deadline) {
      return {
        found,
        viaChangeMs: found ? Math.round(now() - sentAt) : null,
        viaSaveMs: null,
        polls,
        firstAnswerMs: first.ms,
        firstAnswerCount: first.count,
        via: result.via,
        lastPush: describeDiagnostics(result.diagnostics),
        pushes: 0,
        stale: 0,
        empty: 0,
      }
    }
    await sleep(intervalMs)
  }
}

export async function runPullCase(server, app, language, { repeats = 5, waitMs = 20000 } = {}) {
  const relative = DIAGNOSTIC_CASES[language].file
  writeCase(app, language, 'good')
  server.sync(relative)
  await sleep(300)
  const reps = []
  for (let i = 0; i < repeats; i++) {
    writeCase(app, language, 'broken')
    const broken = await pullStep(server, language, { relative, want: 'match', waitMs })
    writeCase(app, language, 'good')
    const fixed = await pullStep(server, language, { relative, want: 'clear', waitMs })
    reps.push({ broken, fixed })
  }
  return summarizeReps(reps, server.pull ? 'pull' : 'push-fallback')
}

export function summarizeReps(reps, mode) {
  const sum = (pick) => reps.reduce((total, rep) => total + pick(rep), 0)
  return {
    mode,
    repeats: reps.length,
    correct: reps.filter((rep) => rep.broken.found && rep.fixed.found).length,
    brokenFound: reps.filter((rep) => rep.broken.found).length,
    fixedCleared: reps.filter((rep) => rep.fixed.found).length,
    brokenNeededSave: reps.filter((rep) => rep.broken.found && rep.broken.viaChangeMs === null).length,
    fixedNeededSave: reps.filter((rep) => rep.fixed.found && rep.fixed.viaChangeMs === null).length,
    stalePushes: sum((rep) => rep.broken.stale + rep.fixed.stale),
    emptyPushes: sum((rep) => rep.broken.empty + rep.fixed.empty),
    brokenLatency: summarizeValues(reps.map((rep) => rep.broken.viaChangeMs ?? NaN)),
    fixedLatency: summarizeValues(reps.map((rep) => rep.fixed.viaChangeMs ?? NaN)),
    brokenViaSaveLatency: summarizeValues(reps.map((rep) => rep.broken.viaSaveMs ?? NaN)),
    fixedViaSaveLatency: summarizeValues(reps.map((rep) => rep.fixed.viaSaveMs ?? NaN)),
    sample: reps[0],
  }
}
