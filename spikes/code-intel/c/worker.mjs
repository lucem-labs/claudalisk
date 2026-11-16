import { parentPort, workerData } from 'node:worker_threads'
import vm from 'node:vm'

const { code, ops } = workerData
const waiting = new Map()
let nextId = 1

parentPort.on('message', (message) => {
  if (message.type !== 'result') return
  const entry = waiting.get(message.id)
  waiting.delete(message.id)
  entry?.(message.payload)
})

const call = (op, argsJson) =>
  new Promise((resolve) => {
    const id = nextId++
    waiting.set(id, resolve)
    parentPort.postMessage({ type: 'call', id, op: String(op), argsJson: String(argsJson) })
  })

const emit = (text) => parentPort.postMessage({ type: 'print', text: String(text) })

const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })

const factory = vm.runInContext(
  `(function (call, emit, opsJson) {
    const show = (value) => {
      if (typeof value === 'string') return value
      try {
        const text = JSON.stringify(value)
        return text === undefined ? String(value) : text
      } catch (error) {
        return String(value)
      }
    }
    const ci = {}
    for (const op of JSON.parse(opsJson)) {
      ci[op] = async (...args) => {
        const reply = JSON.parse(await call(op, JSON.stringify(args)))
        if (!reply.ok) throw new Error(reply.error)
        return reply.value
      }
    }
    const print = (...args) => {
      emit(args.map(show).join(' '))
    }
    const run = async (fn) => {
      try {
        const value = await fn(Object.freeze(ci), print)
        return JSON.stringify({ ok: true, returned: value === undefined ? undefined : show(value) })
      } catch (error) {
        return JSON.stringify({ ok: false, error: String((error && error.message) || error) })
      }
    }
    return run
  })`,
  context,
)

const run = factory(call, emit, JSON.stringify(ops))

let outcome
try {
  const script = new vm.Script(`(async (ci, print) => {\n${code}\n})`, { filename: 'snippet.js' })
  outcome = JSON.parse(await run(script.runInContext(context)))
} catch (error) {
  outcome = { ok: false, error: String(error?.message ?? error) }
}
parentPort.postMessage({ type: 'done', ...outcome })
