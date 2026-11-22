import { environmentCommand } from '../environment-command.mjs'
import { takeBackup } from '../operations.mjs'

export const backup = environmentCommand({
  script: 'backup.mjs',
  changes: 'dumps the uat databases and deletes the older uat backups',
  options: { reason: { type: 'string' } },
  run: async ({ options, runner, settings, now }) => {
    console.log(await takeBackup(runner, settings('uat'), { reason: options.reason ?? 'manual', now }))
  },
})
