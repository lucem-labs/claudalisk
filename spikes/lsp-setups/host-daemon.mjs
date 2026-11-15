import { existsSync, unlinkSync } from 'node:fs'
import net from 'node:net'
import { pathToFileURL } from 'node:url'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { HostServer, normalizeDiagnostic } from './lib/host-server.mjs'
import { endpointFor, request } from './lib/daemon-protocol.mjs'
import { insideRoot, languageOf, sleep } from './lib/common.mjs'

const option = (name) => {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? process.argv[index + 1] : undefined
}

const root = option('root')
if (!root) {
  process.stderr.write('Usage: node host-daemon.mjs --root <worktree root> [--idle-minutes <n>]\n')
  process.exit(2)
}

const worktree = resolve(root)
const endpoint = endpointFor(worktree)
const idleMs = Number(option('idle-minutes') ?? 30) * 60000
const launcherPath = process.env.CLAUDALISK_LSP_LAUNCHER
const launcher = launcherPath ? (await import(pathToFileURL(resolve(launcherPath)).href)).hostLaunch : undefined

const servers = new Map()
let idleTimer
let closing = false

function touch() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => shutdown(), idleMs)
}

function serverFor(language) {
  let entry = servers.get(language)
  if (entry) return entry
  entry = { language, queue: Promise.resolve(), failed: undefined, instance: undefined, readyAt: undefined }
  entry.ready = (async () => {
    try {
      entry.instance = await HostServer.start(language, worktree, { launcher })
      await entry.instance.waitLoaded()
      entry.readyAt = Date.now()
    } catch (error) {
      entry.failed = String(error.message ?? error).slice(0, 400)
      throw error
    }
  })()
  entry.ready.catch(() => {})
  servers.set(language, entry)
  return entry
}

async function diagnostics(message) {
  const file = isAbsolute(message.file) ? message.file : join(worktree, message.file)
  const language = languageOf(file)
  if (!language || !insideRoot(worktree, file)) return { ok: true, skipped: true }
  const entry = serverFor(language)
  const deadlineMs = Number(message.deadlineMs ?? 60000)
  const state = await Promise.race([entry.ready.then(() => 'ready', () => 'failed'), sleep(deadlineMs).then(() => 'pending')])
  if (state === 'failed') return { ok: false, error: entry.failed }
  if (state === 'pending') return { ok: true, pending: true }
  const started = Date.now()
  const run = entry.queue.then(() => entry.instance.diagnostics(relative(worktree, file), { text: message.text }))
  entry.queue = run.catch(() => {})
  const result = await run
  return { ok: true, via: result.via, action: result.action, ms: Date.now() - started, diagnostics: result.diagnostics.map(normalizeDiagnostic) }
}

function status() {
  const entries = [...servers].map(([language, entry]) => [language, { pid: entry.instance?.pid, ready: Boolean(entry.readyAt), failed: entry.failed, pull: entry.instance?.pull }])
  return { ok: true, pid: process.pid, root: worktree, servers: Object.fromEntries(entries) }
}

async function shutdown() {
  if (closing) return
  closing = true
  clearTimeout(idleTimer)
  await Promise.all([...servers.values()].map((entry) => entry.instance?.stop().catch(() => {})))
  server.close()
  if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint)
  process.exit(0)
}

async function handle(message) {
  touch()
  try {
    if (message.method === 'diagnostics') return { id: message.id, ...(await diagnostics(message)) }
    if (message.method === 'status') return { id: message.id, ...status() }
    if (message.method === 'shutdown') {
      setImmediate(() => shutdown())
      return { id: message.id, ok: true }
    }
    return { id: message.id, ok: false, error: `unknown method ${message.method}` }
  } catch (error) {
    return { id: message.id, ok: false, error: String(error.message ?? error).slice(0, 400) }
  }
}

const server = net.createServer((socket) => {
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('error', () => {})
  socket.on('data', async (chunk) => {
    buffer += chunk
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      let message
      try {
        message = JSON.parse(line)
      } catch {
        socket.write(`${JSON.stringify({ ok: false, error: 'not JSON' })}\n`)
        continue
      }
      const answer = await handle(message)
      if (!socket.destroyed) socket.write(`${JSON.stringify(answer)}\n`)
    }
  })
})

function listen(attempt = 0) {
  server.once('error', async (error) => {
    if (error.code !== 'EADDRINUSE') throw error
    const alive = await request(endpoint, { method: 'status' }, { timeoutMs: 1000 }).then(() => true, () => false)
    if (alive || attempt > 0) process.exit(0)
    if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint)
    listen(attempt + 1)
  })
  server.listen(endpoint, () => touch())
}

process.on('SIGTERM', () => shutdown())
process.on('SIGINT', () => shutdown())
listen()
