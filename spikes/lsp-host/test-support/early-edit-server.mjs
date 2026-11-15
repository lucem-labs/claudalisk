import { MessageParser, encodeMessage } from '../lib/rpc.mjs'

const send = (message) => process.stdout.write(encodeMessage(message))
let initializeId

const parser = new MessageParser((message) => {
  if (message.method === 'initialize') {
    initializeId = message.id
    const target = `${message.params.rootUri}/early.txt`
    send({ jsonrpc: '2.0', id: 501, method: 'workspace/applyEdit', params: { edit: { documentChanges: [{ textDocument: { uri: target, version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'bye' }] }] } } })
  } else if (message.id === 501) {
    send({ jsonrpc: '2.0', id: initializeId, result: { capabilities: { experimental: { applyResult: message.result } } } })
  } else if (message.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: message.id, result: null })
  } else if (message.method === 'exit') {
    process.exit(0)
  }
})
process.stdin.on('data', (chunk) => parser.push(chunk))
