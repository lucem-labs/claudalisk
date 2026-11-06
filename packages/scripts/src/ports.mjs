import { createServer } from 'node:net'

function listen() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

export async function freePorts(count) {
  const servers = []
  try {
    for (let i = 0; i < count; i++) servers.push(await listen())
    return servers.map((server) => server.address().port)
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolvePromise) => server.close(resolvePromise))))
  }
}

export function envLines(names, ports) {
  return names.map((name, index) => `${name}=${ports[index]}\n`).join('')
}
