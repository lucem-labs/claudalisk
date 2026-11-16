import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { createFixture } from '../../test-support/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const spike = join(here, '..', '..')
const fixture = createFixture()
const environment = { ...process.env, CLAUDE_PROJECT_DIR: fixture.root }

const cli = (name, ...args) => spawnSync(process.execPath, [join(spike, name, 'cli.mjs'), ...args], { env: environment, encoding: 'utf8', windowsHide: true, timeout: 120000 })

after(() => {
  cli('b', 'stop')
  fixture.remove()
})

test('MCP: initialize, tools/list and tools/call over a real stdio server', { timeout: 5 * 60 * 1000 }, async () => {
  const child = spawn(process.execPath, [join(spike, 'b', 'mcp.mjs')], { env: environment, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
  const lines = createInterface({ input: child.stdout })
  const waiting = new Map()
  lines.on('line', (line) => {
    const message = JSON.parse(line)
    waiting.get(message.id)?.(message)
  })
  const ask = (id, method, params) => new Promise((resolve) => {
    waiting.set(id, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  try {
    const initialized = await ask(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    assert.equal(initialized.result.serverInfo.name, 'code-intel-b')
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    const listed = await ask(2, 'tools/list', {})
    assert.deepEqual(listed.result.tools.map((t) => t.name), ['find', 'definition', 'implementations', 'callers', 'callees', 'references', 'rename', 'replaceBody', 'diagnostics'])
    const found = await ask(3, 'tools/call', { name: 'references', arguments: { name: 'entities/order:useOrder' } })
    assert.equal(found.result.isError, undefined)
    assert.match(found.result.content[0].text, /^5 references in 3 files\n/)
    const refused = await ask(4, 'tools/call', { name: 'references', arguments: { name: 'entities/order:nothing' } })
    assert.equal(refused.result.isError, true)
    assert.match(refused.result.content[0].text, /no symbol matches/)
  } finally {
    child.stdin.end()
    await new Promise((resolve) => child.once('exit', resolve))
  }
})

test('CLI: the first call starts the host in the background, the next one reuses it, stop ends it', { timeout: 5 * 60 * 1000 }, () => {
  const first = cli('b', 'references', 'entities/order:useOrder')
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /^5 references in 3 files\n/)
  const started = Date.now()
  const second = cli('a', 'references', 'src/entities/order/model/use-order.ts', '6', '17')
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /^5 references in 3 files\n/)
  assert.ok(Date.now() - started < 60000)
  const refused = cli('b', 'definition', 'entities/order:nothing')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /no symbol matches/)
  assert.equal(cli('b', 'stop').stdout.trim(), 'stopped')
  assert.equal(cli('b', 'stop').stdout.trim(), 'not running')
})
