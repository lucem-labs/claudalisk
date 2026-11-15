import { MessageParser, encodeMessage } from '../lib/rpc.mjs'

const send = (message) => process.stdout.write(encodeMessage(message))
let pendingConfiguration

const parser = new MessageParser((message) => {
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { renameProvider: { prepareProvider: true } } } })
  } else if (message.method === 'initialized') {
    send({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'ready ✓' } })
    pendingConfiguration = 900
    send({ jsonrpc: '2.0', id: pendingConfiguration, method: 'workspace/configuration', params: { items: [{ section: 'a' }, { section: 'b' }] } })
  } else if (message.id === pendingConfiguration) {
    send({ jsonrpc: '2.0', method: 'test/configured', params: { answer: message.result } })
  } else if (message.method === 'echo') {
    send({ jsonrpc: '2.0', id: message.id, result: message.params })
  } else if (message.method === 'fail') {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'no such thing' } })
  } else if (message.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: message.id, result: null })
  } else if (message.method === 'exit') {
    process.exit(0)
  }
})
process.stdin.on('data', (chunk) => parser.push(chunk))
