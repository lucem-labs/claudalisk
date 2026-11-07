import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { run } from './process.mjs'

export function parseOptions(options, args = process.argv.slice(2)) {
  return parseArgs({ args, options, strict: true, allowPositionals: false }).values
}

export function assertHandRun(script, what, env = process.env) {
  if (env.CI || env.GITHUB_ACTIONS) throw new Error(`${script} ${what} and is run by hand only, never in CI.`)
}

export async function runMain(main, { argv = process.argv, env = process.env, runner = run, exit = (code) => { process.exitCode = code } } = {}) {
  const appRoot = resolve(dirname(argv[1]), '..')
  try {
    const result = await main({ appRoot, argv: argv.slice(2), env, runner })
    if (Number.isInteger(result) && result > 0) {
      exit(result)
      return result
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    const code = Number.isInteger(error?.exitCode) && error.exitCode > 0 ? error.exitCode : 1
    exit(code)
    return code
  }
}
