import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { assertEnvironment, stateDirectory } from '../environment.mjs'
import { adoptVolume, initEnvironment } from '../init.mjs'

export async function promptHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  output.write(question)
  const silent = new Writable({ write: (chunk, encoding, done) => done() })
  const reader = createInterface({ input, output: silent, terminal: Boolean(input.isTTY) })
  try {
    return (await reader.question('')).trim()
  } finally {
    reader.close()
    output.write('\n')
  }
}

export async function init({ appRoot, argv, env, runner, prompt = promptHidden }) {
  assertHandRun('init.mjs', 'creates env files and data volumes on this machine', env)
  const options = parseOptions({
    environment: { type: 'string' },
    'adopt-volume': { type: 'boolean', default: false },
    password: { type: 'string' },
  }, argv)
  assertEnvironment(options.environment)
  if (options.password !== undefined && !options['adopt-volume']) throw new Error('--password is only for --adopt-volume.')
  const app = readApp(appRoot)
  const stateDir = stateDirectory(app.name, env)
  if (options['adopt-volume']) {
    const askPassword = async (volume) => options.password ?? prompt(`Password the volume ${volume} was created with: `)
    await adoptVolume(runner, app, options.environment, { env, stateDir, askPassword })
    return
  }
  await initEnvironment(runner, app, options.environment, { env, stateDir })
}
