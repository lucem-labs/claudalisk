import { createServer } from 'node:http'

export function createStubServer(stubs) {
  return createServer((request, response) => {
    const [, name, ...rest] = new URL(request.url, 'http://stub').pathname.split('/')
    const stub = Object.hasOwn(stubs, name) ? stubs[name] : undefined
    if (!stub) {
      response.writeHead(502, { 'content-type': 'text/plain' })
      response.end(`No third-party stub is named ${JSON.stringify(name)}.`)
      return
    }
    stub(request, response, `/${rest.join('/')}`)
  })
}

export async function startStubs(stubs, port) {
  const server = createStubServer(stubs)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => {
      server.close(resolve)
      server.closeAllConnections()
    }),
  }
}
