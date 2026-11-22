import { basename } from 'node:path'
import { compose, deployedVersion } from '../environment.mjs'
import { environmentCommand } from '../environment-command.mjs'
import { waitForHealth } from '../http.mjs'
import { migrate, restore, takeBackup } from '../operations.mjs'

export const refreshDev = environmentCommand({
  script: 'refresh-dev.mjs',
  changes: 'replaces the dev data with a uat backup',
  options: {
    backup: { type: 'string', default: 'latest' },
    fresh: { type: 'boolean', default: false },
  },
  run: async ({ options, runner, settings, health = waitForHealth, now }) => {
    const dev = settings('dev')
    const deployed = await deployedVersion(runner, dev)
    if (!deployed) throw new Error("Deploy dev first (node scripts/deploy.mjs --environment dev): the refresh needs dev's database and API image.")

    let backup = options.backup
    if (options.fresh) {
      if (backup !== 'latest') throw new Error('--fresh takes a new uat backup; do not combine it with --backup.')
      console.log('Taking a fresh, read-only backup of uat.')
      backup = basename(await takeBackup(runner, settings('uat'), { reason: 'refresh-dev', now }))
    }

    await restore(runner, dev, { backup, noStart: true, now })
    console.log(`Applying dev's pending migrations (dev runs ${deployed.sha.slice(0, 7)}, ${deployed.ref}).`)
    await migrate(runner, dev, deployed)
    await compose(runner, dev, ['start', 'api'])
    if (!(await health(dev))) throw new Error("Dev's API did not become healthy after the refresh.")
    console.log(`Dev refreshed from uat backup ${backup} and running at ${dev.baseUrl}.`)
  },
})
