import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { createHandler, listTools, serveStdio } from '../../lib/mcp.mjs'
import { CodeIntelError } from '../../lib/errors.mjs'
import { integer, string } from '../../lib/tool.mjs'

const tools = [
  { name: 'echo', description: 'Echo.', params: [string('text', 'what to echo'), integer('times', 'how often')], run: async (ws, i) => `${ws.prefix}${i.text.repeat(i.times)}` },
  { name: 'refuse', description: 'Refuses.', params: [], run: async () => { throw new CodeIntelError('ambiguous: 2 symbols') } },
  { name: 'crash', description: 'Crashes.', params: [], run: async () => { throw new Error('boom') } },
]

const handler = () => createHandler({ name: 'test', tools, workspace: () => ({ prefix: '>' }) })

test('initialize answers with the tools capability and echoes the protocol version', async () => {
  const reply = await handler()({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
  assert.equal(reply.id, 1)
  assert.equal(reply.result.protocolVersion, '2025-03-26')
  assert.deepEqual(reply.result.capabilities, { tools: {} })
  assert.equal(reply.result.serverInfo.name, 'test')
})

test('notifications get no answer', async () => {
  assert.equal(await handler()({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined)
})

test('tools/list gives name, description and a JSON schema with the required arguments', async () => {
  const reply = await handler()({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  assert.deepEqual(reply.result.tools[0], {
    name: 'echo',
    description: 'Echo.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'what to echo' }, times: { type: 'integer', description: 'how often' } }, required: ['text', 'times'] },
  })
  assert.equal(listTools(tools).length, 3)
})

test('tools/call returns the text, and a refusal or a crash comes back as an error result, not a protocol error', async () => {
  const call = (name, args) => handler()({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })
  assert.deepEqual((await call('echo', { text: 'ab', times: '2' })).result, { content: [{ type: 'text', text: '>abab' }] })
  assert.deepEqual((await call('refuse', {})).result, { content: [{ type: 'text', text: 'ambiguous: 2 symbols' }], isError: true })
  assert.deepEqual((await call('crash', {})).result, { content: [{ type: 'text', text: 'failed: boom' }], isError: true })
  assert.match((await call('echo', { text: 'a' })).result.content[0].text, /missing times/)
})

test('an unknown tool or method is a JSON-RPC error', async () => {
  assert.equal((await handler()({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } })).error.code, -32602)
  assert.equal((await handler()({ jsonrpc: '2.0', id: 5, method: 'resources/list' })).error.code, -32601)
})

test('newline-delimited messages in on a stream give one JSON line out per request', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const written = []
  output.on('data', (chunk) => written.push(...chunk.toString().split('\n').filter(Boolean)))
  let closed = false
  serveStdio({ name: 'test', tools, workspace: () => ({ prefix: '' }), input, output, onClose: async () => (closed = true) })
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n')
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
  input.write('not json\n')
  input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"x","times":3}}}\n')
  input.end()
  await new Promise((resolve) => setTimeout(resolve, 400))
  const replies = written.map((line) => JSON.parse(line))
  assert.deepEqual(replies.map((r) => r.id).sort(), [1, 2, null].sort())
  assert.equal(replies.find((r) => r.id === 2).result.content[0].text, 'xxx')
  assert.equal(replies.find((r) => r.id === null).error.code, -32700)
  assert.ok(closed)
})

test('tools/list serves the annotations of a tool and leaves them out when it has none', () => {
  const listed = listTools([
    { name: 'read', description: 'r', params: [], annotations: { readOnlyHint: true } },
    { name: 'plain', description: 'p', params: [] },
  ])
  assert.deepEqual(listed[0].annotations, { readOnlyHint: true })
  assert.equal('annotations' in listed[1], false)
})
