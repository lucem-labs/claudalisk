import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { assertEnvironment, stateDirectory } from '../environment.mjs'
import { initEnvironment } from '../init.mjs'

export async function init({ appRoot, argv, env, runner }) {
  assertHandRun('init.mjs', 'creates env files and data volumes on this machine', env)
  const options = parseOptions({ environment: { type: 'string' } }, argv)
  assertEnvironment(options.environment)
  const app = readApp(appRoot)
  await initEnvironment(runner, app, options.environment, { env, stateDir: stateDirectory(app.name, env) })
}
