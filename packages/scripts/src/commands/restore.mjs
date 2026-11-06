import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { assertEnvironment, loadEnvironment } from '../environment.mjs'
import { restore as restoreBackup } from '../operations.mjs'

export async function restore({ appRoot, argv, env, runner, now }) {
  assertHandRun('restore.mjs', 'replaces the data of an environment', env)
  const options = parseOptions({
    environment: { type: 'string' },
    backup: { type: 'string' },
    confirm: { type: 'string' },
    'owner-approved': { type: 'boolean', default: false },
    'no-start': { type: 'boolean', default: false },
  }, argv)
  assertEnvironment(options.environment)
  const app = readApp(appRoot)
  await restoreBackup(runner, loadEnvironment(options.environment, { app, env }), {
    backup: options.backup,
    confirm: options.confirm,
    ownerApproved: options['owner-approved'],
    noStart: options['no-start'],
    now,
  })
}
