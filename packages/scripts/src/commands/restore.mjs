import { assertEnvironment } from '../environment.mjs'
import { environmentCommand } from '../environment-command.mjs'
import { restore as restoreBackup } from '../operations.mjs'

export const restore = environmentCommand({
  script: 'restore.mjs',
  changes: 'replaces the data of an environment',
  options: {
    environment: { type: 'string' },
    backup: { type: 'string' },
    confirm: { type: 'string' },
    'owner-approved': { type: 'boolean', default: false },
    'no-start': { type: 'boolean', default: false },
  },
  run: async ({ options, runner, settings, now }) => {
    assertEnvironment(options.environment)
    await restoreBackup(runner, settings(options.environment), {
      backup: options.backup,
      confirm: options.confirm,
      ownerApproved: options['owner-approved'],
      noStart: options['no-start'],
      now,
    })
  },
})
