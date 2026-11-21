export const OS_ASSIGNED = 0

export function resolvePorts(names, env = process.env) {
  return Object.fromEntries(names.map((name) => {
    if (!env[name]) return [name, OS_ASSIGNED]
    const port = Number(env[name])
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be a port number, got ${JSON.stringify(env[name])}.`)
    return [name, port]
  }))
}

export function portOf(url) {
  return Number(new URL(url).port)
}
