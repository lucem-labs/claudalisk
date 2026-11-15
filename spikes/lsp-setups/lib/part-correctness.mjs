import { caseFolder, copyFresh } from '../../lsp-host/lib/fixture.mjs'
import { removeApp } from '../../lsp-host/lib/runner.mjs'
import { DIAGNOSTIC_CASES, prepareApp, runPullCase, runPushCase, waitReady, writeCase } from './cases.mjs'
import { LANGUAGES, SETUPS, chosenRoslynArgs, startEmulated, startSetup } from './setups.mjs'
import { pickSolution, roslynAttempts, roslynHelp } from './launch.mjs'
import { hasMatch } from './cases.mjs'
import { log, now, round } from './common.mjs'
import { restoreSolution } from '../../lsp-host/lib/servers.mjs'

const errorText = (error) => String(error?.message ?? error).slice(0, 600)

async function stopQuietly(started) {
  if (!started) return
  try {
    await started.client.stop()
  } catch {
    started.client.client?.child?.kill()
  }
}

async function oneAttempt({ attempt, base, work, index }) {
  const app = copyFresh(base, caseFolder(work, `attempt-${index}`))
  prepareApp(app)
  const record = { id: attempt.id, args: attempt.args, description: attempt.description, loaded: false, pushedDiagnostics: false }
  let started
  try {
    const solution = pickSolution(app)
    restoreSolution(app, solution)
    started = await startEmulated('lspjson', 'csharp', app, { roslynArgs: attempt.args.map((arg) => (arg === '@solution' ? solution : arg)) })
    const ready = await waitReady(started.client, 'csharp', { timeoutMs: 120000, log })
    record.loaded = ready.ms !== null
    record.loadMs = ready.ms
    record.lastAnswer = ready.last
    started.client.open(DIAGNOSTIC_CASES.csharp.file)
    writeCase(app, 'csharp', 'broken')
    const mark = started.client.mark()
    started.client.change(DIAGNOSTIC_CASES.csharp.file)
    const push = await started.client.waitPush(DIAGNOSTIC_CASES.csharp.file, mark, hasMatch('csharp'), 20000)
    record.pushedDiagnostics = push.found
    record.pushMs = push.found ? round(push.ms) : null
    record.pushesSeen = push.seen.length
    record.serverRequests = [...new Set(started.client.client.serverRequests)]
  } catch (error) {
    record.error = errorText(error)
  } finally {
    record.stderrTail = started?.client.client.stderr.slice(-400)
    await stopQuietly(started)
    removeApp(app)
  }
  return record
}

export async function attemptsPart({ base, work }) {
  const help = roslynHelp()
  const probeApp = copyFresh(base, caseFolder(work, 'attempt-probe'))
  let solution
  try {
    solution = pickSolution(probeApp)
  } finally {
    removeApp(probeApp)
  }
  const attempts = roslynAttempts(help, '@solution')
  const records = []
  let index = 0
  for (const attempt of attempts) {
    index++
    log(`lspjson roslyn attempt ${attempt.id}`)
    records.push(await oneAttempt({ attempt, base, work, index }))
  }
  const chosen = records.find((r) => r.loaded && r.pushedDiagnostics) ?? records.find((r) => r.loaded) ?? records[0]
  return { help: help.slice(0, 6000), solutionExample: solution ? 'found' : 'missing', attempts: records, chosen: { id: chosen.id, args: attempts.find((a) => a.id === chosen.id).args } }
}

export async function correctnessPart({ base, work, setups = Object.keys(SETUPS), languages = LANGUAGES }) {
  const out = {}
  for (const setup of setups) {
    out[setup] = {}
    for (const language of languages) {
      const entry = { server: SETUPS[setup].serverOf[language] }
      out[setup][language] = entry
      const app = copyFresh(base, caseFolder(work, `${setup}-${language}`))
      prepareApp(app)
      let started
      log(`correctness ${setup} ${language}`)
      try {
        const roslynArgs = setup === 'lspjson' ? chosenRoslynArgs().map((arg) => (arg === '@solution' ? pickSolution(app) : arg)) : undefined
        const startedAt = now()
        started = await startSetup(setup, language, app, { roslynArgs })
        entry.source = started.launched?.source
        entry.initializeMs = round(now() - startedAt)
        const ready = await waitReady(started.client, language, { timeoutMs: 300000, log })
        entry.ready = ready
        entry.capabilities = {
          diagnosticProvider: Boolean(started.client.initialize?.capabilities?.diagnosticProvider),
          textDocumentSync: started.client.initialize?.capabilities?.textDocumentSync,
        }
        const runner = SETUPS[setup].driver === 'pull' ? runPullCase : runPushCase
        entry.result = await runner(started.client, app, language, { repeats: 5, waitMs: 20000 })
      } catch (error) {
        entry.error = errorText(error)
      } finally {
        await stopQuietly(started)
        removeApp(app)
      }
    }
  }
  return out
}
