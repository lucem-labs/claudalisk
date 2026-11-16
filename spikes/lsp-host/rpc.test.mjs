import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { LspClient, MessageParser, RpcError, encodeMessage } from './lib/rpc.mjs'

const fake = join(dirname(fileURLToPath(import.meta.url)), 'test-support', 'fake-server.mjs')

test('a message is framed with the byte length of its UTF-8 body', () => {
  const frame = encodeMessage({ jsonrpc: '2.0', method: 'x', params: { text: 'zażółć' } })
  const header = frame.subarray(0, frame.indexOf('\r\n\r\n')).toString('ascii')
  const body = frame.subarray(frame.indexOf('\r\n\r\n') + 4)
  assert.equal(header, `Content-Length: ${body.length}`)
})

test('the parser rebuilds messages from chunks split anywhere, and several messages in one chunk', () => {
  const messages = []
  const parser = new MessageParser((m) => messages.push(m))
  const bytes = Buffer.concat([encodeMessage({ id: 1, result: 'zażółć' }), encodeMessage({ id: 2, result: 'b' })])
  for (let i = 0; i < bytes.length; i += 3) parser.push(bytes.subarray(i, i + 3))
  assert.deepEqual(messages.map((m) => m.id), [1, 2])
  assert.equal(messages[0].result, 'zażółć')
  parser.push(bytes)
  assert.equal(messages.length, 4)
})

test('the client sends requests, matches ids, answers server requests and shuts down cleanly', async () => {
  const client = new LspClient({ command: process.execPath, args: [fake] }).start()
  const initialized = await client.request('initialize', {})
  assert.equal(initialized.capabilities.renameProvider.prepareProvider, true)
  client.notify('initialized', {})
  const configured = await client.waitForNotification('test/configured')
  assert.deepEqual(configured.answer, [null, null])
  const log = await client.waitForNotification('window/logMessage')
  assert.equal(log.message, 'ready ✓')
  const [a, b] = await Promise.all([client.request('echo', { n: 1 }), client.request('echo', { n: 2 })])
  assert.deepEqual([a.n, b.n], [1, 2])
  await assert.rejects(client.request('fail', {}), (error) => error instanceof RpcError && error.code === -32601)
  await client.shutdown()
  assert.equal(client.exited.code, 0)
  assert.ok(client.serverRequests.includes('workspace/configuration'))
})

test('a request to a server that has exited rejects instead of hanging', async () => {
  const client = new LspClient({ command: process.execPath, args: ['-e', 'process.exit(3)'] }).start()
  await client.exitPromise
  await assert.rejects(client.request('initialize', {}), /not running|exited/)
})
