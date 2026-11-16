import { MessageParser, encodeMessage } from '../../lsp-host/lib/rpc.mjs'

const pull = process.argv.includes('--pull')
const texts = new Map()
const send = (message) => process.stdout.write(encodeMessage(message))

const diagnosticsOf = (text) =>
  text.includes('stepz')
    ? [{ range: { start: { line: 6, character: 4 }, end: { line: 6, character: 9 } }, severity: 1, code: 'schema', message: 'Property stepz is not allowed.' }]
    : []

const publish = (uri) => setTimeout(() => send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: diagnosticsOf(texts.get(uri) ?? '') } }), 30)

const parser = new MessageParser((message) => {
  const { method, params, id } = message
  if (method === 'initialize') {
    const capabilities = pull ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}
    send({ jsonrpc: '2.0', id, result: { capabilities: { ...capabilities, referencesProvider: true } } })
  } else if (method === 'textDocument/didOpen') {
    texts.set(params.textDocument.uri, params.textDocument.text)
    if (!pull) publish(params.textDocument.uri)
  } else if (method === 'textDocument/didChange') {
    texts.set(params.textDocument.uri, params.contentChanges[0].text)
    if (!pull) publish(params.textDocument.uri)
  } else if (method === 'textDocument/diagnostic') {
    send({ jsonrpc: '2.0', id, result: { kind: 'full', items: diagnosticsOf(texts.get(params.textDocument.uri) ?? '') } })
  } else if (method === 'shutdown') {
    send({ jsonrpc: '2.0', id, result: null })
  } else if (method === 'exit') {
    process.exit(0)
  } else if (id !== undefined && method) {
    send({ jsonrpc: '2.0', id, result: null })
  }
})
process.stdin.on('data', (chunk) => parser.push(chunk))
