import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { needsContainer, run, testProjects } from './lib/fixture.mjs'

function app(files) {
  const root = mkdtempSync(join(tmpdir(), 'lsp-host-fixture-'))
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return root
}

test('a test project needs a container when its sources create a database', () => {
  assert.equal(needsContainer('var c = await PostgresServer.CreateMigratedDatabaseAsync(token);'), true)
  assert.equal(needsContainer('await PostgresServer.CreateDatabaseAsync();'), true)
  assert.equal(needsContainer('PostgresServer.BuildServices(NoDatabase, modules)'), false)
})

test('test projects are found by folder, and the ones that need a container are marked', () => {
  const root = app({
    'backend/Proof.Api.Tests/Proof.Api.Tests.csproj': '',
    'backend/Proof.Api.Tests/Host.cs': 'await PostgresServer.CreateDatabaseAsync();',
    'backend/Proof.ArchitectureTests/Proof.ArchitectureTests.csproj': '',
    'backend/Proof.ArchitectureTests/Rules.cs': 'class Rules {}',
    'backend/Proof.ArchitectureTests/obj/Generated.cs': 'PostgresServer.CreateDatabaseAsync',
    'backend/Proof.Testing/Proof.Testing.csproj': '',
    'backend/Proof.Orphan.Tests/Orphan.cs': '',
  })
  try {
    assert.deepEqual(testProjects(root), [
      { name: 'Proof.ArchitectureTests', needsContainer: false },
      { name: 'Proof.Api.Tests', needsContainer: true },
    ].sort((a, b) => a.name.localeCompare(b.name)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('npm runs without a shell warning and with its output captured', () => {
  const result = run('npm', ['--version'], tmpdir())
  assert.equal(result.ok, true)
  assert.match(result.output, /^\d+\.\d+\.\d+/)
  assert.doesNotMatch(result.output, /DEP0190/)
})
