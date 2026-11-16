import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function fakeSession(root, handlers = {}, { capabilities = {} } = {}) {
  const calls = []
  const open = new Set()
  const session = {
    name: 'fake',
    root,
    calls,
    capabilities,
    uri: (rel) => pathToFileURL(join(root, rel)).href,
    isOpen: (uri) => open.has(uri),
    open(rel) {
      open.add(session.uri(rel))
      calls.push(['open', rel, readFileSync(join(root, rel), 'utf8')])
    },
    resync(rel) {
      calls.push(['resync', rel, readFileSync(join(root, rel), 'utf8')])
    },
    waitLoaded: async () => {},
    stop: async () => {
      calls.push(['stop'])
    },
    apply: () => [],
    client: {
      diagnostics: new Map(),
      request: async (method, params) => {
        calls.push([method, params])
        const handler = handlers[method]
        return typeof handler === 'function' ? handler(params, calls.filter((c) => c[0] === method).length) : handler
      },
    },
  }
  return session
}
