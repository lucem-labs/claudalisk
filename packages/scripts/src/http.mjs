import { request } from 'node:http'
import { sleep } from './process.mjs'

export function callApi(settings, method, path, body, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = request(
      {
        host: '127.0.0.1',
        port: Number(settings.proxyPort),
        method,
        path,
        headers: {
          Host: settings.proxyPort === '80' ? settings.hostName : `${settings.hostName}:${settings.proxyPort}`,
          Accept: 'application/json',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
        },
        timeout: timeoutMs,
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => {
          let json = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            json = null
          }
          resolvePromise({ status: response.statusCode, text, json })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`${method} ${path} timed out after ${timeoutMs} ms.`)))
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

export async function waitForHealth(settings, { attempts = 60, delayMs = 2000, call = callApi } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await call(settings, 'GET', '/api/health', undefined, { timeoutMs: 5000 })
      if (response.status === 200) return response.json ?? true
    } catch {
    }
    if (attempt < attempts - 1) await sleep(delayMs)
  }
  return null
}
