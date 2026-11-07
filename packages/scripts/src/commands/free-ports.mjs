import { appendFileSync } from 'node:fs'
import { envLines, freePorts } from '../ports.mjs'

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export async function exportFreePorts({ argv, env = process.env, ports = freePorts, append = appendFileSync, log = console.log }) {
  if (argv.length === 0) throw new Error('Usage: node scripts/free-ports.mjs NAME...')
  for (const name of argv) {
    if (!NAME.test(name)) throw new Error(`${JSON.stringify(name)} is not a valid environment variable name.`)
  }
  if (new Set(argv).size !== argv.length) throw new Error('Each variable name can be given once.')
  const lines = envLines(argv, await ports(argv.length))
  if (env.GITHUB_ENV) append(env.GITHUB_ENV, lines)
  else log(lines.trimEnd())
  return 0
}
