import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDispatcher, listen, request, rootHash, send, socketPath, spawnDaemon } from '../../lib/daemon.mjs'
import { help, runCli } from '../../lib/cli.mjs'
import { coerce, inputFromArguments, integer, string, usage } from '../../lib/tool.mjs'
import { CodeIntelError } from '../../lib/errors.mjs'

const tools = [
  { name: 'echo', description: 'Echo.', params: [string('text', 't'), integer('times', 'n')], run: async (ws, i) => `${ws.stopped ? 'stopped' : 'live'}:${i.text.repeat(i.times)}` },
  { name: 'refuse', description: 'Refuses.', params: [], run: async () => { throw new CodeIntelError('ambiguous') } },
]

const unique = () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

test('the socket path is a named pipe on Windows and a unix socket in the temporary folder elsewhere', () => {
  const root = resolve('project')
  assert.match(socketPath(root, { platform: 'win32' }), /^\\\\\.\\pipe\\claudalisk-ci-[0-9a-f]{12}$/)
  assert.equal(socketPath(root, { platform: 'linux', tmp: '/tmp' }), join('/tmp', `claudalisk-ci-${rootHash(root, 'linux')}.sock`))
  assert.match(socketPath(root, { platform: 'darwin', tmp: '/var/T' }), /claudalisk-ci-[0-9a-f]{12}\.sock$/)
})

test('each root has its own socket, and the case of the root is ignored where the file system ignores it', () => {
  assert.notEqual(socketPath(resolve('a')), socketPath(resolve('b')))
  assert.equal(rootHash(resolve('Project'), 'win32'), rootHash(resolve('project'), 'win32'))
  assert.notEqual(rootHash(resolve('Project'), 'linux'), rootHash(resolve('project'), 'linux'))
})

test('a request and its answer cross a real socket, the workspace is the one the host holds, and stop ends the host', async () => {
  const path = socketPath(join(tmpdir(), `ci-daemon-${unique()}`), { tmp: tmpdir() })
  const workspace = { stopped: false, stop: async () => (workspace.stopped = true) }
  let exited = false
  const dispatch = createDispatcher({ workspace, loadTools: async (name) => (name === 'a' ? tools : []) })
  await listen({ path, workspace, dispatch, idleMs: 60000, onExit: () => (exited = true) })
  assert.deepEqual(await send(path, { op: 'ping' }), { ok: true, text: 'pong' })
  assert.deepEqual(await send(path, { op: 'call', interface: 'a', tool: 'echo', input: { text: 'ab', times: '2' } }), { ok: true, text: 'live:abab' })
  assert.deepEqual(await send(path, { op: 'call', interface: 'a', tool: 'refuse', input: {} }), { ok: false, text: 'ambiguous' })
  assert.deepEqual(await send(path, { op: 'call', interface: 'a', tool: 'nope' }), { ok: false, text: 'unknown operation nope' })
  assert.deepEqual(await send(path, { op: 'call', interface: 'z', tool: 'echo' }), { ok: false, text: 'unknown operation echo' })
  assert.deepEqual(await send(path, { op: 'stop' }), { ok: true, text: 'stopped' })
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.ok(exited)
  assert.ok(workspace.stopped)
})

test('the host exits after the idle time', async () => {
  const path = socketPath(join(tmpdir(), `ci-idle-${unique()}`), { tmp: tmpdir() })
  const workspace = { stop: async () => {} }
  const exited = new Promise((resolve) => listen({ path, workspace, dispatch: async () => ({ ok: true, text: '' }), idleMs: 150, onExit: resolve }))
  await exited
  await assert.rejects(send(path, { op: 'ping' }, { timeoutMs: 500 }), (error) => ['ECONNREFUSED', 'ENOENT'].includes(error.code))
})

test('the host exits when its root folder no longer exists, and stays while it does', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-root-'))
  const path = socketPath(root, { tmp: tmpdir() })
  let stopped = 0
  let exits = 0
  const workspace = { stop: async () => stopped++ }
  const listening = listen({ path, workspace, dispatch: async () => ({ ok: true, text: '' }), idleMs: 60000, root, watchMs: 50, onExit: () => exits++ })
  await listening
  try {
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(exits, 0)
    assert.deepEqual(await send(path, { op: 'ping' }), { ok: true, text: '' })
    rmSync(root, { recursive: true, force: true })
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(exits, 1)
    assert.equal(stopped, 1)
    await assert.rejects(send(path, { op: 'ping' }, { timeoutMs: 500 }), (error) => ['ECONNREFUSED', 'ENOENT'].includes(error.code))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a detached host does not keep its root folder alive, so deleting the root ends the host', { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-detached-'))
  const path = socketPath(root)
  try {
    const answer = await request(root, { op: 'ping' }, { start: spawnDaemon, path })
    assert.deepEqual(answer, { ok: true, text: 'pong' })
    rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 200 })
    const deadline = Date.now() + 30000
    let alive = true
    while (alive && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      alive = await send(path, { op: 'ping' }, { timeoutMs: 1000 }).then(() => true, () => false)
    }
    assert.equal(alive, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stopping the host twice stops the workspace once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-twice-'))
  let stopped = 0
  const { stop } = await listen({ path: socketPath(root, { tmp: tmpdir() }), workspace: { stop: async () => stopped++ }, idleMs: 60000, root, watchMs: 20 })
  await Promise.all([stop(), stop()])
  assert.equal(stopped, 1)
  rmSync(root, { recursive: true, force: true })
})

test('the client starts the host when nothing listens, then talks to it, and stop of a host that is not running starts nothing', async () => {
  const root = join(tmpdir(), `ci-start-${unique()}`)
  const path = socketPath(root, { tmp: tmpdir() })
  const workspace = { stop: async () => {} }
  let started = 0
  let server
  const start = () => {
    started++
    listen({ path, workspace, dispatch: async (r) => ({ ok: true, text: `got ${r.tool}` }), idleMs: 60000 }).then((s) => (server = s))
  }
  assert.deepEqual(await request(root, { op: 'stop' }, { start, path }), { ok: true, text: 'not running' })
  assert.equal(started, 0)
  assert.deepEqual(await request(root, { op: 'call', tool: 'x' }, { start, path }), { ok: true, text: 'got x' })
  assert.deepEqual(await request(root, { op: 'call', tool: 'y' }, { start, path }), { ok: true, text: 'got y' })
  assert.equal(started, 1)
  await server.stop()
})

test('tool arguments are coerced from strings, and the last text argument takes the rest of the words', () => {
  assert.deepEqual(coerce(tools[0], { text: 'a', times: '3' }), { text: 'a', times: 3 })
  assert.throws(() => coerce(tools[0], { text: 'a', times: 'x' }), /integer/)
  assert.throws(() => coerce(tools[0], {}), /missing text; usage: echo <text> <times>/)
  assert.deepEqual(inputFromArguments(tools[0], ['a', '2']), { text: 'a', times: '2' })
  assert.deepEqual(inputFromArguments({ params: [string('name', ''), string('body', '')] }, ['N', 'return', '1;']), { name: 'N', body: 'return 1;' })
  assert.equal(usage({ name: 'f', params: [string('a', ''), string('b', '', true)] }), 'f <a> [b]')
})

test('the CLI maps arguments to the host call and prints the text, refusals go to stderr with exit code 1', async () => {
  const out = []
  const err = []
  const sent = []
  const send = async (root, payload) => {
    sent.push(payload)
    return payload.tool === 'refuse' ? { ok: false, text: 'ambiguous' } : { ok: true, text: 'fine' }
  }
  const io = { root: '/r', send, out: (t) => out.push(t), err: (t) => err.push(t) }
  assert.equal(await runCli('a', tools, ['echo', 'x', '2'], io), 0)
  assert.deepEqual(sent[0], { op: 'call', interface: 'a', tool: 'echo', input: { text: 'x', times: '2' } })
  assert.equal(await runCli('a', tools, ['refuse'], io), 1)
  assert.equal(await runCli('a', tools, ['echo', 'x'], io), 2)
  assert.equal(await runCli('a', tools, ['nope'], io), 2)
  assert.equal(await runCli('a', tools, ['stop'], io), 0)
  assert.equal(await runCli('a', tools, [], io), 0)
  assert.deepEqual(out, ['fine', 'fine', help('a', tools)])
  assert.match(err.join('\n'), /ambiguous[\s\S]*usage: echo <text> <times>[\s\S]*unknown operation nope/)
})
