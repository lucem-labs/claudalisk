import { createInterface } from 'node:readline'
import { errorText } from './errors.mjs'
import { callTool, inputSchema } from './tool.mjs'

export const PROTOCOL_VERSION = '2024-11-05'

export function listTools(tools) {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: inputSchema(tool), ...(tool.annotations ? { annotations: tool.annotations } : {}) }))
}

const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

export function createHandler({ name, tools, workspace }) {
  return async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return failure(null, -32600, 'invalid request')
    const { id, method, params } = message
    if (id === undefined) return undefined
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name, version: '0.0.0' } } }
    }
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} }
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: listTools(tools) } }
    if (method === 'tools/call') {
      const tool = tools.find((t) => t.name === params?.name)
      if (!tool) return failure(id, -32602, `unknown tool ${params?.name}`)
      try {
        const text = await callTool(tool, workspace(), params.arguments ?? {})
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }
      } catch (error) {
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: errorText(error) }], isError: true } }
      }
    }
    return failure(id, -32601, `method not found: ${method}`)
  }
}

export function serveStdio({ name, tools, workspace, input = process.stdin, output = process.stdout, onClose }) {
  const handle = createHandler({ name, tools, workspace })
  const lines = createInterface({ input })
  const pending = new Set()
  const write = (response) => output.write(`${JSON.stringify(response)}\n`)
  lines.on('line', (line) => {
    if (!line.trim()) return
    let message
    try {
      message = JSON.parse(line)
    } catch {
      write(failure(null, -32700, 'parse error'))
      return
    }
    const work = handle(message).then((response) => response && write(response))
    pending.add(work)
    work.finally(() => pending.delete(work))
  })
  lines.on('close', async () => {
    await Promise.allSettled([...pending])
    await onClose?.()
  })
  return lines
}
