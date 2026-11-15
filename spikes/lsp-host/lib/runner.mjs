import { rmSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { caseFolder, copyFresh, verifyBuild } from './fixture.mjs'
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
  const polls = []
  while (Date.now() < deadline) {
    attempts++
    const requestStart = Date.now()
    try {
      const answer = locationKeys(await session.references(probe.file, probe.needle))
      const durationMs = Date.now() - requestStart
      last = answer
      const correct = answer === expectedKey
      polls.push({ startMs: requestStart - spawnedAt, durationMs, correct })
      if (correct) {
        firstCorrect ??= { startMs: requestStart - spawnedAt, durationMs }
        if (previous === true) return { ms: firstCorrect.startMs + firstCorrect.durationMs, attempts, count: probe.expected.length, firstCorrectRequest: firstCorrect, polls: polls.slice(-12) }
      } else {
        firstCorrect = undefined
      }
      previous = correct
    } catch (error) {
      previous = undefined
      firstCorrect = undefined
      last = error.message
      polls.push({ startMs: requestStart - spawnedAt, durationMs: Date.now() - requestStart, error: true })
      if (session.client.exited) throw error
      await sleep(50)
    }
  }
  throw new Error(`no stable correct findReferences within ${timeoutMs} ms (last answer ${last}, expected ${expectedKey}); server stderr: ${session.client.stderr.slice(-1200)}`)
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

export function context(session, app, language, clientOptions = {}) {
  const verification = { runs: 0, buildMs: 0, testMs: 0, skipped: [], ran: [] }
  const verify = () => {
    const result = verifyBuild(app, language)
    verification.runs++
    verification.buildMs += result.buildMs ?? 0
    verification.testMs += result.testMs ?? 0
    verification.skipped = result.skipped ?? []
    verification.ran = result.ran ?? []
    if (!result.ok) throw new Error(`${result.stage} failed after the edit: ${result.output.slice(-700).trim()}`)
    return true
  }
  return { session, app, language, verify, verification, clientOptions, Unsupported }
}

export async function runCase({ server, definition, base, work, name }) {
  const app = copyFresh(base, caseFolder(work, name))
  const language = definition.language
  const started = Date.now()
  let session
  const record = { id: definition.id, server, status: 'fail', reason: '', phase: 'start', details: {} }
  try {
    session = await Session.start(server, app, { log: () => {}, requestHandlers: definition.requestHandlers, clientOptions: definition.clientOptions })
    const cold = await coldStart(session, session.started.spawnedAt)
    record.coldStartMs = cold.ms
    record.coldStart = { attempts: cold.attempts, firstCorrectRequest: cold.firstCorrectRequest }
    record.phase = 'case'
    const ctx = context(session, app, language, definition.clientOptions)
    ctx.details = record.details
    record.verification = ctx.verification
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
