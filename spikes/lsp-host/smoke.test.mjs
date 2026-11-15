import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casesFor } from './lib/cases.mjs'
import { ensureBase } from './lib/fixture.mjs'
import { runCase } from './lib/runner.mjs'

const TEN_MINUTES = 10 * 60 * 1000
const fixture = await ensureBase()

const CASES = { 'csharp-ls': 'rename.record-property', roslyn: 'rename.record-property', typescript: 'rename.barrel-all-sites' }

for (const [server, id] of Object.entries(CASES)) {
  test(`${server} renames a symbol, and the build and the tests pass afterwards`, { timeout: TEN_MINUTES }, async () => {
    const definition = casesFor(server).find((d) => d.id === id)
    const record = await runCase({ server, definition, base: fixture.base, work: fixture.work, name: `smoke-${server}` })
    assert.equal(record.status, 'pass', record.reason)
    assert.ok(Number.isFinite(record.coldStartMs), 'a cold start was measured')
  })
}
