import { basename } from 'node:path'
import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { compose, deployedVersion, loadEnvironment } from '../environment.mjs'
import { waitForHealth } from '../http.mjs'
import { migrate, restore, takeBackup } from '../operations.mjs'

export async function refreshDev({ appRoot, argv, env, runner, health = waitForHealth, now }) {
  assertHandRun('refresh-dev.mjs', 'replaces the dev data with a uat backup', env)
  const options = parseOptions({
    backup: { type: 'string', default: 'latest' },
    fresh: { type: 'boolean', default: false },
  }, argv)
  const app = readApp(appRoot)
  const dev = loadEnvironment('dev', { app, env })
  const deployed = await deployedVersion(runner, dev)
  if (!deployed) throw new Error("Deploy dev first (node scripts/deploy.mjs --environment dev): the refresh needs dev's database and API image.")

  let backup = options.backup
  if (options.fresh) {
    if (backup !== 'latest') throw new Error("--fresh takes a new uat backup; do not combine it with --backup.")
    console.log('Taking a fresh, read-only backup of uat.')
    backup = basename(await takeBackup(runner, loadEnvironment('uat', { app, env }), { reason: 'refresh-dev', now }))
  }

  await restore(runner, dev, { backup, noStart: true, now })
  console.log(`Applying dev's pending migrations (dev runs ${deployed.sha.slice(0, 7)}, ${deployed.ref}).`)
  await migrate(runner, dev, deployed)
  await compose(runner, dev, ['start', 'api'])
  if (!(await health(dev))) throw new Error("Dev's API did not become healthy after the refresh.")
  console.log(`Dev refreshed from uat backup ${backup} and running at ${dev.baseUrl}.`)
}
