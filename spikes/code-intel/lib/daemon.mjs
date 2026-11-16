import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, unlinkSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorText } from './errors.mjs'
import { callTool } from './tool.mjs'
import { Workspace } from './workspace.mjs'

export const IDLE_MS = 15 * 60 * 1000
export const WATCH_MS = 5000

export function rootHash(root, platform = process.platform) {
  const normalized = resolve(root)
  return createHash('sha1').update(platform === 'linux' ? normalized : normalized.toLowerCase()).digest('hex').slice(0, 12)
}

export function socketPath(root, { platform = process.platform, tmp = tmpdir() } = {}) {
  const hash = rootHash(root, platform)
  return platform === 'win32' ? `\\\\.\\pipe\\claudalisk-ci-${hash}` : join(tmp, `claudalisk-ci-${hash}.sock`)
}

const interfaceTools = async (name) => (await import(new URL(`../${name}/tools.mjs`, import.meta.url))).tools

export function createDispatcher({ workspace, loadTools = interfaceTools }) {
  return async function dispatch(request) {
    if (request.op === 'ping') return { ok: true, text: 'pong' }
    if (request.op !== 'call') return { ok: false, text: `unknown request ${request.op}` }
    try {
      const tools = await loadTools(request.interface)
      const tool = tools.find((t) => t.name === request.tool)
      if (!tool) return { ok: false, text: `unknown operation ${request.tool}` }
      return { ok: true, text: await callTool(tool, workspace, request.input ?? {}) }
    } catch (error) {
      return { ok: false, text: errorText(error) }
    }
  }
}

export function listen({ path, workspace, dispatch = createDispatcher({ workspace }), idleMs = IDLE_MS, root, watchMs = WATCH_MS, onExit = () => {} }) {
  let timer
  let watcher
  let server
  let stopping
  const stop = () => (stopping ??= shutDown())
  const shutDown = async () => {
    clearTimeout(timer)
    clearInterval(watcher)
    await new Promise((done) => server.close(done))
    await workspace.stop()
    onExit()
  }
  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(stop, idleMs)
    timer.unref?.()
  }
  server = net.createServer((socket) => {
    touch()
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('error', () => {})
    socket.on('data', async (chunk) => {
      buffer += chunk
      const end = buffer.indexOf('\n')
      if (end < 0) return
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      let request
      try {
        request = JSON.parse(line)
      } catch {
        socket.end(`${JSON.stringify({ ok: false, text: 'bad request' })}\n`)
        return
      }
      if (request.op === 'stop') {
        socket.end(`${JSON.stringify({ ok: true, text: 'stopped' })}\n`, () => stop())
        return
      }
      const response = await dispatch(request)
      touch()
      socket.end(`${JSON.stringify(response)}\n`)
    })
  })
  return new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      touch()
      if (root) watcher = setInterval(() => existsSync(root) || stop(), watchMs)
      resolveListening({ server, stop })
    })
  })
}

export function send(path, request, { timeoutMs = 600000 } = {}) {
  return new Promise((resolveResponse, reject) => {
    const socket = net.connect(path)
    let buffer = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`no answer within ${timeoutMs} ms`))
    }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk) => (buffer += chunk))
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.on('close', () => {
      clearTimeout(timer)
      try {
        resolveResponse(JSON.parse(buffer))
      } catch {
        reject(new Error('the host closed the connection without an answer'))
      }
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unreachable = (error) => ['ECONNREFUSED', 'ENOENT'].includes(error.code)

export function spawnDaemon(root) {
  const script = fileURLToPath(import.meta.url)
  const child = spawn(process.execPath, [script, root], { cwd: tmpdir(), detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: root } })
  child.unref()
}

export async function request(root, payload, { start = spawnDaemon, path = socketPath(root), startupMs = 30000, timeoutMs } = {}) {
  try {
    return await send(path, payload, { timeoutMs })
  } catch (error) {
    if (!unreachable(error)) throw error
  }
  if (payload.op === 'stop') return { ok: true, text: 'not running' }
  start(root)
  const deadline = Date.now() + startupMs
  let last
  while (Date.now() < deadline) {
    try {
      return await send(path, payload, { timeoutMs })
    } catch (error) {
      if (!unreachable(error)) throw error
      last = error
      await sleep(100)
    }
  }
  throw new Error(`the host did not start within ${startupMs} ms (${last?.message})`)
}

export async function main(root) {
  const path = socketPath(root)
  const workspace = new Workspace({ root })
  const attempt = () => listen({ path, workspace, root, onExit: () => process.exit(0) })
  try {
    await attempt()
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error
    const alive = await send(path, { op: 'ping' }, { timeoutMs: 2000 }).then(() => true, () => false)
    if (alive) process.exit(0)
    if (existsSync(path)) unlinkSync(path)
    await attempt()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(resolve(process.argv[2] ?? process.cwd())).catch(() => process.exit(1))
}
