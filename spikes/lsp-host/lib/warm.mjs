import { join } from 'node:path'
import { copyFresh } from './fixture.mjs'
import { median, percentile, treeMemory } from './memory.mjs'
import { READY, coldStart, removeApp } from './runner.mjs'
import { Session } from './session.mjs'

export const WARM_RUNS = 25

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
  const app = copyFresh(base, join(work, 'cases', `warm-${server}`))
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
    return { capabilities: slimCapabilities(session.capabilities), coldStartMs: cold.ms, coldStartAttempts: cold.attempts, references: stats(references), prepareRename: stats(prepares), memoryAfterLoadMb, memoryAfterWorkloadMb }
  } finally {
    if (session) await session.stop().catch(() => session.client.child?.kill())
    removeApp(app)
  }
}
