import { readApp } from './app-config.mjs'
import { assertHandRun, parseOptions } from './cli.mjs'
import { loadEnvironment } from './environment.mjs'

export function environmentCommand({ script, changes, options = {}, run }) {
  return async ({ appRoot, argv, env, runner, ...injected }) => {
    assertHandRun(script, changes, env)
    const parsed = parseOptions(options, argv)
    const app = readApp(appRoot)
    return run({
      ...injected,
      app,
      appRoot,
      env,
      runner,
      options: parsed,
      settings: (environment) => loadEnvironment(environment, { app, env }),
    })
  }
}
