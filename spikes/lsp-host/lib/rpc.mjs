import { spawn } from 'node:child_process'

const HEADER_END = Buffer.from('\r\n\r\n')

export class RpcError extends Error {
  constructor(method, error) {
    super(`${method}: ${error.message ?? 'error'} (${error.code})`)
    this.code = error.code
    this.data = error.data
  }
}

export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}

export class MessageParser {
  constructor(onMessage) {
    this.onMessage = onMessage
    this.buffer = Buffer.alloc(0)
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const end = this.buffer.indexOf(HEADER_END)
      if (end < 0) return
      const header = this.buffer.subarray(0, end).toString('ascii')
      const match = /content-length:\s*(\d+)/i.exec(header)
      if (!match) throw new Error(`Header without Content-Length: ${header}`)
      const length = Number(match[1])
      const start = end + HEADER_END.length
      if (this.buffer.length < start + length) return
      const body = this.buffer.subarray(start, start + length).toString('utf8')
      this.buffer = this.buffer.subarray(start + length)
      this.onMessage(JSON.parse(body))
    }
  }
}

export class LspClient {
  constructor({ command, args = [], cwd, env, requestHandlers = {}, requestTimeoutMs = 120000 }) {
    this.spec = { command, args, cwd, env }
    this.requestHandlers = requestHandlers
    this.requestTimeoutMs = requestTimeoutMs
    this.nextId = 1
    this.pending = new Map()
    this.notifications = []
    this.waiters = []
    this.diagnostics = new Map()
    this.stderr = ''
    this.exited = undefined
    this.serverRequests = []
  }

  start() {
    const { command, args, cwd, env } = this.spec
    this.child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.pid = this.child.pid
    this.parser = new MessageParser((message) => this.receive(message))
    this.child.stdout.on('data', (chunk) => {
      try {
        this.parser.push(chunk)
      } catch (error) {
        this.failAll(error)
      }
    })
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-20000)
    })
    this.child.stdin.on('error', () => {})
    this.exitPromise = new Promise((resolve) => {
      this.child.on('exit', (code, signal) => {
        this.exited = { code, signal }
        this.failAll(new Error(`server exited (${code ?? signal})`))
        resolve(this.exited)
      })
      this.child.on('error', (error) => {
        this.exited = { error: error.message }
        this.failAll(error)
        resolve(this.exited)
      })
    })
    return this
  }

  failAll(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(error)
    }
    this.pending.clear()
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
  }

  send(message) {
    if (this.exited) throw new Error('server is not running')
    this.child.stdin.write(encodeMessage(message))
  }

  request(method, params, { timeoutMs = this.requestTimeoutMs } = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer, method })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, params })
  }

  receive(message) {
    if (message.method !== undefined && message.id !== undefined) {
      this.answer(message)
    } else if (message.method !== undefined) {
      this.notifications.push({ method: message.method, params: message.params })
      if (message.method === 'textDocument/publishDiagnostics') this.diagnostics.set(message.params.uri, message.params)
      for (const waiter of this.waiters.slice()) {
        if (waiter.method === message.method && waiter.predicate(message.params)) {
          clearTimeout(waiter.timer)
          this.waiters.splice(this.waiters.indexOf(waiter), 1)
          waiter.resolve(message.params)
        }
      }
    } else {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new RpcError(entry.method, message.error))
      else entry.resolve(message.result)
    }
  }

  async answer(message) {
    this.serverRequests.push(message.method)
    try {
      const handler = this.requestHandlers[message.method] ?? defaultHandlers[message.method]
      const result = handler ? await handler(message.params, this) : null
      this.send({ jsonrpc: '2.0', id: message.id, result: result ?? null })
    } catch (error) {
      if (this.exited) return
      this.send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } })
    }
  }

  waitForNotification(method, predicate = () => true, timeoutMs = this.requestTimeoutMs) {
    const seen = this.notifications.find((n) => n.method === method && predicate(n.params))
    if (seen) return Promise.resolve(seen.params)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error(`no ${method} within ${timeoutMs} ms`))
      }, timeoutMs)
      const waiter = { method, predicate, resolve, reject, timer }
      this.waiters.push(waiter)
    })
  }

  async shutdown({ graceMs = 5000 } = {}) {
    if (!this.child) return
    if (!this.exited) {
      try {
        await this.request('shutdown', null, { timeoutMs: graceMs })
        this.notify('exit', null)
      } catch {
        this.child.kill()
      }
    }
    const timer = setTimeout(() => this.child.kill(), graceMs)
    await this.exitPromise
    clearTimeout(timer)
  }
}

export const defaultHandlers = {
  'workspace/configuration': (params) => params.items.map(() => null),
  'client/registerCapability': () => null,
  'client/unregisterCapability': () => null,
  'window/workDoneProgress/create': () => null,
  'window/showMessageRequest': () => null,
  'workspace/workspaceFolders': () => null,
  'workspace/applyEdit': () => ({ applied: false, failureReason: 'applyEdit is handled by the host, not by the default handler' }),
}
