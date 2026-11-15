import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { copyFresh, ensureBase } from './lib/fixture.mjs'
import { removeApp } from './lib/runner.mjs'
import { Session } from './lib/session.mjs'

const TEN_MINUTES = 10 * 60 * 1000
const fixture = await ensureBase()

async function capabilitiesOf(server) {
  const app = copyFresh(fixture.base, join(fixture.work, 'cases', `capabilities-${server}`))
  const session = await Session.start(server, app)
  try {
    return session.capabilities
  } finally {
    await session.stop()
    removeApp(app)
  }
}

const has = (value) => Boolean(value)

test('csharp-ls advertises rename with prepare, call hierarchy, implementation and code actions', { timeout: TEN_MINUTES }, async () => {
  const capabilities = await capabilitiesOf('csharp-ls')
  assert.equal(capabilities.renameProvider?.prepareProvider, true)
  assert.ok(has(capabilities.callHierarchyProvider))
  assert.ok(has(capabilities.implementationProvider))
  assert.ok(has(capabilities.codeActionProvider))
})

test('TypeScript 7 advertises rename with prepare, call hierarchy, code action kinds and willRename', { timeout: TEN_MINUTES }, async () => {
  const capabilities = await capabilitiesOf('typescript')
  assert.equal(capabilities.renameProvider?.prepareProvider, true)
  assert.ok(has(capabilities.callHierarchyProvider))
  assert.ok(has(capabilities.implementationProvider))
  for (const kind of ['quickfix', 'source.organizeImports', 'source.removeUnusedImports', 'source.sortImports', 'source.fixAll']) {
    assert.ok(capabilities.codeActionProvider?.codeActionKinds?.includes(kind), `code action kind ${kind}`)
  }
  assert.ok(capabilities.workspace?.fileOperations?.willRename?.filters?.length > 0)
})

test('Roslyn advertises its capabilities, which are recorded in the results', { timeout: TEN_MINUTES }, async () => {
  const capabilities = await capabilitiesOf('roslyn')
  assert.equal(capabilities.renameProvider?.prepareProvider, true)
  assert.ok(has(capabilities.callHierarchyProvider))
  assert.ok(has(capabilities.codeActionProvider))
  console.log(`roslyn capabilities: ${Object.keys(capabilities).sort().join(', ')}`)
})
