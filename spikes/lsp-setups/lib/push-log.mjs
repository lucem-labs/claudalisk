import { keyOf } from '../../lsp-host/lib/edits.mjs'
import { now } from './common.mjs'

export function trackPushes(client) {
  const pushes = []
  const original = client.receive.bind(client)
  client.receive = (message) => {
    if (message.method === 'textDocument/publishDiagnostics' && message.id === undefined) {
      pushes.push({ at: now(), key: keyOf(message.params.uri), uri: message.params.uri, diagnostics: message.params.diagnostics ?? [] })
    }
    original(message)
  }
  return pushes
}

export const pushesFor = (pushes, uri, since = 0) => pushes.slice(since).filter((push) => push.key === keyOf(uri))
