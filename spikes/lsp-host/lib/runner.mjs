import { mkdirSync, rmSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { copyFresh, verifyBuild } from './fixture.mjs'
import { Session } from './session.mjs'
import { treeMemory } from './memory.mjs'

export class Unsupported extends Error {}

export const READY = {
  csharp: { file: 'backend/Proof.LspCases/Pricing.cs', needle: 'Total(int quantity', expected: ['Pricing.cs:4', 'Pricing.cs:6', 'Pricing.cs:13', 'Sample.cs:8'] },
  typescript: { file: 'frontend/src/shared/lib/price/format-price.ts', needle: 'formatPrice', expected: ['format-price.ts:2', 'index.ts:0', 'pricing-summary.ts:0', 'pricing-summary.ts:4', 'format-price.test.ts:1', 'format-price.test.ts:4'] },
}

export const locationKeys = (locations) => locations.map((l) => `${l.uri.split('/').pop()}:${l.range.start.line}`).sort().join(',')

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function coldStart(session, spawnedAt, { timeoutMs = 300000 } = {}) {
  const probe = READY[session.definition.language]
  const expectedKey = [...probe.expected].sort().join(',')
  const deadline = Date.now() + timeoutMs
  let previous
  let firstCorrect
  let attempts = 0
  let last
  while (Date.now() < deadline) {
    attempts++
    try {
      const answer = locationKeys(await session.references(probe.file, probe.needle))
      last = answer
      const correct = answer === expectedKey
      if (correct) {
        firstCorrect ??= Date.now()
        if (previous === true) return { ms: firstCorrect - spawnedAt, attempts, count: probe.expected.length }
      } else {
        firstCorrect = undefined
      }
      previous = correct
    } catch (error) {
      previous = undefined
      firstCorrect = undefined
      last = error.message
      if (session.client.exited) throw error
    }
    await sleep(250)
  }
  throw new Error(`no stable correct findReferences within ${timeoutMs} ms (last answer ${last}, expected ${expectedKey})`)
}

export function removeApp(app) {
  const link = join(app, 'frontend', 'node_modules')
  if (existsSync(link)) {
    try {
      unlinkSync(link)
    } catch {
      rmSync(link, { force: true })
    }
  }
  try {
    rmSync(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch {}
}

export function context(session, app, language) {
  const verify = () => {
    const result = verifyBuild(app, language)
    if (!result.ok) throw new Error(`${result.stage} failed after the edit: ${result.output.slice(-700).trim()}`)
    return true
  }
  return { session, app, language, verify, Unsupported }
}

export async function runCase({ server, definition, base, work, name }) {
  const app = join(work, 'cases', name)
  mkdirSync(join(work, 'cases'), { recursive: true })
  copyFresh(base, app)
  const language = definition.language
  const started = Date.now()
  let session
  const record = { id: definition.id, server, status: 'fail', reason: '', phase: 'start', details: {} }
  try {
    session = await Session.start(server, app, { log: () => {}, requestHandlers: definition.requestHandlers })
    const cold = await coldStart(session, session.started.spawnedAt)
    record.coldStartMs = cold.ms
    record.phase = 'case'
    const ctx = context(session, app, language)
    ctx.details = record.details
    const outcome = await definition.run(ctx)
    record.status = 'pass'
    if (outcome) Object.assign(record.details, outcome)
  } catch (error) {
    if (error instanceof Unsupported) {
      record.status = 'unsupported'
      record.reason = error.message
    } else {
      record.status = 'fail'
      record.reason = String(error.message ?? error).slice(0, 900)
    }
  }
  if (session) {
    try {
      record.memoryMb = treeMemory(session.client.pid).megabytes
    } catch {
      record.memoryMb = null
    }
    try {
      await session.stop()
    } catch {
      session.client.child?.kill()
    }
  }
  record.ms = Date.now() - started
  removeApp(app)
  return record
}
