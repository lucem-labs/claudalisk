import { createServer } from 'node:net'

function reserve() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

export async function freePorts(count) {
  const servers = []
  try {
    for (let index = 0; index < count; index++) servers.push(await reserve())
    return servers.map((server) => server.address().port)
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
  }
}

export async function resolvePorts(names, env = process.env, pick = freePorts) {
  const missing = names.filter((name) => !env[name])
  const picked = await pick(missing.length)
  return Object.fromEntries(names.map((name) => {
    if (!env[name]) return [name, picked[missing.indexOf(name)]]
    const port = Number(env[name])
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be a port number, got ${JSON.stringify(env[name])}.`)
    return [name, port]
  }))
}
