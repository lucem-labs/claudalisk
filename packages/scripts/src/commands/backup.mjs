import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { loadEnvironment } from '../environment.mjs'
import { takeBackup } from '../operations.mjs'

export async function backup({ appRoot, argv, env, runner, now }) {
  assertHandRun('backup.mjs', 'dumps the uat databases', env)
  const options = parseOptions({ reason: { type: 'string' } }, argv)
  const app = readApp(appRoot)
  console.log(await takeBackup(runner, loadEnvironment('uat', { app, env }), { reason: options.reason ?? 'manual', now }))
}
