import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { assertEnvironment, stateDirectory } from '../environment.mjs'
import { environmentCommand } from '../environment-command.mjs'
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

export const init = environmentCommand({
  script: 'init.mjs',
  changes: 'creates env files and data volumes on this machine',
  options: {
    environment: { type: 'string' },
    'adopt-volume': { type: 'boolean', default: false },
    password: { type: 'string' },
  },
  run: async ({ app, env, options, runner, prompt = promptHidden }) => {
    assertEnvironment(options.environment)
    if (options.password !== undefined && !options['adopt-volume']) throw new Error('--password is only for --adopt-volume.')
    const stateDir = stateDirectory(app.name, env)
    if (options['adopt-volume']) {
      const askPassword = async (volume) => options.password ?? prompt(`Password the volume ${volume} was created with: `)
      await adoptVolume(runner, app, options.environment, { env, stateDir, askPassword })
      return
    }
    await initEnvironment(runner, app, options.environment, { env, stateDir })
  },
})
