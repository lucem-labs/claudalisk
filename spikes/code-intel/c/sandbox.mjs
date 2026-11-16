import { Worker } from 'node:worker_threads'
import { truncate } from '../lib/format.mjs'

export const DEFAULT_TIMEOUT_MS = 30000
export const OUTPUT_CAP = 6000

const workerUrl = new URL('./worker.mjs', import.meta.url)

export function runSnippet(code, { call, ops, timeoutMs = DEFAULT_TIMEOUT_MS, cap = OUTPUT_CAP }) {
  return new Promise((resolve) => {
    const lines = []
    let size = 0
    let finished = false
    const worker = new Worker(workerUrl, { workerData: { code: String(code), ops }, resourceLimits: { maxOldGenerationSizeMb: 128 }, env: {}, stdout: false, stderr: false })

    const finish = (tail) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      worker.terminate()
      resolve(truncate([...lines, ...tail].join('\n'), cap) || 'ok')
    }

    const timer = setTimeout(() => finish([`error: time limit of ${timeoutMs} ms reached`]), timeoutMs)

    worker.on('message', async (message) => {
      if (message.type === 'print') {
        if (size <= cap) {
          const text = message.text.slice(0, cap + 1 - size)
          lines.push(text)
          size += text.length + 1
        }
      } else if (message.type === 'call') {
        let payload
        try {
          payload = JSON.stringify({ ok: true, value: await call(message.op, JSON.parse(message.argsJson)) })
        } catch (error) {
          payload = JSON.stringify({ ok: false, error: String(error?.message ?? error) })
        }
        if (!finished) worker.postMessage({ type: 'result', id: message.id, payload })
      } else if (message.type === 'done') {
        const tail = []
        if (message.ok && message.returned !== undefined) tail.push(message.returned)
        if (!message.ok) tail.push(`error: ${message.error}`)
        finish(tail)
      }
    })
    worker.on('error', (error) => finish([`error: ${error?.message ?? error}`]))
    worker.on('exit', () => finish(['error: the snippet stopped without a result']))
  })
}
