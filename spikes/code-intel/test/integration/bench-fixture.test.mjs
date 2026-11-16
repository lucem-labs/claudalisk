import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { buildFixture } from '../../../code-intel-bench/fixture.mjs'
import { cloneFixture, readFixture } from '../../../code-intel-bench/fixture-repo.mjs'
import { copyDependencies } from '../../../code-intel-bench/runner.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const spike = join(here, '..', '..')
const MINUTES = 60 * 1000

const scratch = mkdtempSync(join(tmpdir(), 'code-intel-bench-'))
let root
let skipReason
const environment = () => ({ ...process.env, CLAUDE_PROJECT_DIR: root })
const cli = (name, ...args) => spawnSync(process.execPath, [join(spike, name, 'cli.mjs'), ...args], { env: environment(), cwd: root, encoding: 'utf8', windowsHide: true, timeout: 5 * MINUTES })

before(async () => {
  try {
    let fixture
    try {
      fixture = readFixture()
    } catch {
      const built = await buildFixture(join(scratch, 'fixture'), { log: () => {} })
      fixture = { path: built.path, head: built.head }
    }
    const copy = join(scratch, 'app')
    await cloneFixture(copy, { fixture })
    copyDependencies(fixture.path, copy)
    root = realpathSync.native(copy)
  } catch (error) {
    skipReason = `the benchmark fixture cannot be built here: ${error.message}`
    console.error(`SKIPPED: ${skipReason}`)
  }
}, { timeout: 15 * MINUTES })

after(() => {
  if (root) cli('b', 'stop')
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
})

const opts = { timeout: 10 * MINUTES }
const onFixture = (body) => (t) => {
  if (skipReason) return t.skip(skipReason)
  return body(t)
}

test('B and A references on the fixture: a C# symbol in the Billing module and a TypeScript symbol in an FSD slice', opts, onFixture(() => {
  assert.ok(existsSync(join(root, 'backend', 'Bench.slnx')))
  const csharpB = cli('b', 'references', 'Billing.ILedger.Record')
  assert.equal(csharpB.status, 0, csharpB.stderr)
  assert.match(csharpB.stdout, /^9 references in 6 files\n/)
  assert.match(csharpB.stdout, /backend\/Bench\.Modules\.Billing\/Shared\/Ledger\/RefundPosting\.cs \(3\): 7,13,14/)

  const csharpA = cli('a', 'references', 'backend/Bench.Modules.Billing/Shared/Ledger/ILedger.cs', '5', '10')
  assert.equal(csharpA.status, 0, csharpA.stderr)
  assert.equal(csharpA.stdout, csharpB.stdout)

  const typescriptB = cli('b', 'references', 'entities/order:useOrder')
  assert.equal(typescriptB.status, 0, typescriptB.stderr)
  assert.match(typescriptB.stdout, /^4 references in 3 files\n/)
  assert.match(typescriptB.stdout, /frontend\/src\/pages\/orders\/ui\/orders-page\.tsx \(2\): 1,9/)

  const typescriptA = cli('a', 'references', 'frontend/src/entities/order/api/use-order.ts', '7', '17')
  assert.equal(typescriptA.status, 0, typescriptA.stderr)
  assert.equal(typescriptA.stdout, typescriptB.stdout)
}))

test('B resolves a module name that skips the layer namespace, and prefers the type to its constructor', opts, onFixture(() => {
  const found = cli('b', 'definition', 'Ordering.Order')
  assert.equal(found.status, 0, found.stderr)
  assert.match(found.stdout, /backend\/Bench\.Modules\.Ordering\.Domain\/Order\.cs/)
}))

test('MCP: A references over a real stdio server on the fixture', opts, onFixture(async () => {
  const child = spawn(process.execPath, [join(spike, 'a', 'mcp.mjs')], { env: environment(), cwd: root, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
  const lines = createInterface({ input: child.stdout })
  const waiting = new Map()
  lines.on('line', (line) => waiting.get(JSON.parse(line).id)?.(JSON.parse(line)))
  const ask = (id, method, params) => new Promise((resolve) => {
    waiting.set(id, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  try {
    await ask(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    const answer = await ask(2, 'tools/call', { name: 'references', arguments: { file: 'frontend/src/entities/order/api/use-order.ts', line: 7, character: 17 } })
    assert.equal(answer.result.isError, undefined)
    assert.match(answer.result.content[0].text, /^4 references in 3 files\n/)
  } finally {
    child.stdin.end()
    await new Promise((resolve) => child.once('exit', resolve))
  }
}))
