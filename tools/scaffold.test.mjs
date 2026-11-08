import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { addModule, generateBackend } from './scaffold.mjs'

const NOW = new Date('2026-11-08T10:20:30Z')
const created = []

function generated() {
  const target = mkdtempSync(join(tmpdir(), 'scaffold-'))
  created.push(target)
  generateBackend({ target, root: 'Acme', module: 'Ordering', aggregate: 'Order', now: NOW })
  return target
}

function allFiles(folder) {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry)
    return statSync(path).isDirectory() ? allFiles(path) : [path]
  })
}

afterEach(() => {
  for (const folder of created.splice(0)) {
    rmSync(folder, { recursive: true, force: true })
  }
})

describe('generateBackend', () => {
  it('leaves no template token in a name or a file', () => {
    const files = allFiles(generated())
    const token = /<(Root|root|Name|Aggregates?|aggregates|schema|routes?|timestamp)>/
    for (const file of files) {
      assert.doesNotMatch(file, /[\\/](Root|Name|Aggregate|Timestamp)[._A-Z]/)
      assert.doesNotMatch(readFileSync(file, 'utf8'), token, file)
    }
  })

  it('pins every Claudalisk package to the published version', () => {
    const props = readFileSync(join(generated(), 'backend', 'Directory.Packages.props'), 'utf8')
    const versions = [...props.matchAll(/Include="Claudalisk\.[^"]+" Version="([^"]+)"/g)].map((match) => match[1])
    assert.ok(versions.length > 0)
    assert.deepEqual([...new Set(versions)], ['0.1.0-alpha.1'])
  })

  it('names the baseline migration from the clock', () => {
    const migration = join(generated(), 'backend', 'Acme.Modules.Ordering.Persistence', 'Migrations', '20261108102030_InitialOrdering.cs')
    assert.match(readFileSync(migration, 'utf8'), /\[Migration\("20261108102030_InitialOrdering"\)\]/)
  })

  it('refuses a name that is not PascalCase', () => {
    const target = mkdtempSync(join(tmpdir(), 'scaffold-'))
    created.push(target)
    assert.throws(() => generateBackend({ target, root: 'acme', module: 'Ordering', aggregate: 'Order' }), /PascalCase/)
  })

  it('refuses a folder that already has the backend', () => {
    const target = generated()
    assert.throws(() => generateBackend({ target, root: 'Acme', module: 'Billing', aggregate: 'Invoice' }), /already has a backend/)
  })
})

describe('addModule', () => {
  it('creates all six projects and registers them', () => {
    const target = generated()
    addModule({ appRoot: target, module: 'OrderHistory', aggregate: 'HistoryEntry', plural: 'HistoryEntries', now: NOW })
    const backend = join(target, 'backend')
    const solution = readFileSync(join(backend, 'Acme.slnx'), 'utf8')
    for (const suffix of ['', '.Interfaces', '.Domain', '.Persistence', '.Persistence.Interfaces', '.Tests']) {
      const project = `Acme.Modules.OrderHistory${suffix}`
      assert.ok(existsSync(join(backend, project, `${project}.csproj`)), project)
      assert.ok(solution.includes(`${project}/${project}.csproj`), project)
    }
    assert.match(readFileSync(join(backend, 'Acme.Api', 'AppModules.cs'), 'utf8'), /new Acme\.Modules\.OrderHistory\.OrderHistoryModule\(\),\n {4}\];/)
    assert.match(readFileSync(join(backend, 'Acme.Api', 'Acme.Api.csproj'), 'utf8'), /Acme\.Modules\.OrderHistory\/Acme\.Modules\.OrderHistory\.csproj/)
  })

  it('uses snake case for the schema and the table', () => {
    const target = generated()
    addModule({ appRoot: target, module: 'OrderHistory', aggregate: 'HistoryEntry', plural: 'HistoryEntries', now: NOW })
    const migration = readFileSync(join(target, 'backend', 'Acme.Modules.OrderHistory.Persistence', 'Migrations', '20261108102030_InitialOrderHistory.cs'), 'utf8')
    assert.match(migration, /schema: "order_history"/)
    assert.match(migration, /name: "history_entries"/)
  })

  it('edits a Host that has CRLF line endings', () => {
    const target = generated()
    const host = join(target, 'backend', 'Acme.Api', 'Acme.Api.csproj')
    writeFileSync(host, readFileSync(host, 'utf8').replace(/\n/g, '\r\n'))
    addModule({ appRoot: target, module: 'Billing', aggregate: 'Invoice', now: NOW })
    assert.match(readFileSync(host, 'utf8'), /Acme\.Modules\.Billing\.csproj/)
  })

  it('refuses an existing module', () => {
    assert.throws(() => addModule({ appRoot: generated(), module: 'Ordering', aggregate: 'Order2' }), /already exists/)
  })

  it('refuses an aggregate named like its module', () => {
    assert.throws(() => addModule({ appRoot: generated(), module: 'Billing', aggregate: 'Billing' }), /must differ/)
  })
})
