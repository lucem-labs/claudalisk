import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import net from 'node:net'
import { normalizeRoot } from './common.mjs'

export function endpointFor(root, { platform = process.platform, tmp = tmpdir() } = {}) {
  const hash = createHash('sha1').update(normalizeRoot(root, platform)).digest('hex').slice(0, 8)
  if (platform === 'win32') return `\\\\.\\pipe\\claudalisk-lsp-${hash}`
  return `${tmp.replace(/\/+$/, '')}/claudalisk-lsp-${hash}.sock`
}

export function request(endpoint, message, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(endpoint)
    let buffer = ''
    let settled = false
    const timer = setTimeout(() => {
      finish(() => reject(Object.assign(new Error(`no answer from ${endpoint} within ${timeoutMs} ms`), { code: 'ETIMEDOUT' })))
    }, timeoutMs)
    function finish(action) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      action()
    }
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify(message)}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk
      const end = buffer.indexOf('\n')
      if (end < 0) return
      const line = buffer.slice(0, end)
      finish(() => {
        try {
          resolve(JSON.parse(line))
        } catch (error) {
          reject(error)
        }
      })
    })
    socket.on('error', (error) => finish(() => reject(error)))
    socket.on('close', () => finish(() => reject(Object.assign(new Error('connection closed without an answer'), { code: 'ECLOSED' }))))
  })
}

export const isAbsent = (error) => ['ENOENT', 'ECONNREFUSED', 'ECLOSED'].includes(error?.code)
