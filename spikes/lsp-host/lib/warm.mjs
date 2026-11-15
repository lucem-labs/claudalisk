import { caseFolder, copyFresh } from './fixture.mjs'
import { median, percentile, treeMemory } from './memory.mjs'
import { READY, coldStart, removeApp } from './runner.mjs'
import { Session } from './session.mjs'

export const WARM_RUNS = 25

export const REFERENCE_SHAPES = {
  plain: () => ({}),
  partialResultToken: (n) => ({ partialResultToken: `partial-${n}` }),
  workDoneToken: (n) => ({ workDoneToken: `work-${n}` }),
  both: (n) => ({ partialResultToken: `partial-${n}`, workDoneToken: `work-${n}` }),
}

export function slimCapabilities(capabilities) {
  const { semanticTokensProvider, ...rest } = capabilities
  return { ...rest, semanticTokensProvider: semanticTokensProvider ? true : undefined }
}

async function timed(action) {
  const started = performance.now()
  await action()
  return performance.now() - started
}

const stats = (values) => ({ runs: values.length, medianMs: Math.round(median(values) * 10) / 10, p95Ms: Math.round(percentile(values, 0.95) * 10) / 10 })

export async function warmMeasurement({ server, base, work, runs = WARM_RUNS }) {
  const app = copyFresh(base, caseFolder(work, `warm-${server}`))
  let session
  try {
    session = await Session.start(server, app)
    const cold = await coldStart(session, session.started.spawnedAt)
    const memoryAfterLoadMb = treeMemory(session.client.pid).megabytes
    const probe = READY[session.definition.language]
    const references = []
    const prepares = []
    for (let i = 0; i < runs; i++) {
      references.push(await timed(() => session.references(probe.file, probe.needle)))
      prepares.push(await timed(() => session.prepareRename(probe.file, probe.needle)))
    }
    const memoryAfterWorkloadMb = treeMemory(session.client.pid).megabytes
    const referenceShapes = {}
    let token = 0
    for (const [shape, extra] of Object.entries(REFERENCE_SHAPES)) {
      const times = []
      let items
      for (let i = 0; i < runs; i++) {
        token++
        const params = extra(token)
        let answered
        times.push(await timed(async () => (answered = await session.referencesWith(probe.file, probe.needle, params))))
        if (i === 0) {
          const streamed = params.partialResultToken ? session.client.notifications.filter((n) => n.method === '$/progress' && n.params?.token === params.partialResultToken).reduce((sum, n) => sum + (Array.isArray(n.params.value) ? n.params.value.length : 0), 0) : 0
          items = { returned: answered?.length ?? 0, streamed }
        }
      }
      referenceShapes[shape] = { ...stats(times), items }
    }
    const workDoneCreates = session.client.serverRequests.filter((m) => m === 'window/workDoneProgress/create').length
    return { capabilities: slimCapabilities(session.capabilities), coldStartMs: cold.ms, coldStartAttempts: cold.attempts, references: stats(references), prepareRename: stats(prepares), memoryAfterLoadMb, memoryAfterWorkloadMb, referenceShapes, workDoneCreates, serverRequests: [...new Set(session.client.serverRequests)] }
  } finally {
    if (session) await session.stop().catch(() => session.client.child?.kill())
    removeApp(app)
  }
}
