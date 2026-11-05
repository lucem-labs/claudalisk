import { existsSync, mkdirSync } from 'node:fs'
import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import {
  assertEnvironment,
  composeChecked,
  ensureProxyNetwork,
  loadEnvironment,
  startProxyIfNotRunning,
  stateDirectory,
} from '../environment.mjs'
import { assertUatDeployable } from '../guards.mjs'
import { waitForHealth } from '../http.mjs'
import { ensureInitialised } from '../init.mjs'
import { checkUatMigrations, readApprovedEdits, recordUatFingerprints, sourceMigrations } from '../migration-checks.mjs'
import { migrate, takeBackup } from '../operations.mjs'
import { runChecked } from '../process.mjs'
import { pruneBackups } from './prune-backups.mjs'

export async function currentVersion(runner, root) {
  const git = async (args) => (await runChecked(runner, 'git', ['-C', root, ...args])).stdout.trim()
  const sha = await git(['rev-parse', 'HEAD'])
  let ref = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (ref === 'HEAD') {
    const remotes = (await git(['branch', '--remotes', '--points-at', 'HEAD']))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.includes(' -> '))
    ref = remotes[0] ?? 'detached'
  }
  const dirty = (await git(['status', '--porcelain'])).length > 0
  return { sha, ref, dirty }
}

async function recordDeployment(runner, app, settings, sha, ref) {
  try {
    const created = await runChecked(runner, 'gh', ['api', '--method', 'POST', `repos/${app.repo}/deployments`, '--input', '-'], {
      cwd: app.root,
      input: JSON.stringify({ ref: sha, environment: settings.environment, auto_merge: false, required_contexts: [], description: `Local deploy of ${ref}` }),
    })
    const id = JSON.parse(created.stdout).id
    await runChecked(runner, 'gh', ['api', '--method', 'POST', `repos/${app.repo}/deployments/${id}/statuses`, '--input', '-'], {
      cwd: app.root,
      input: JSON.stringify({ state: 'success', environment_url: settings.baseUrl }),
    })
    console.log(`Recorded GitHub deployment ${id}.`)
  } catch (error) {
    console.warn(`Warning: could not record the GitHub deployment (${error.message}).`)
  }
}

export async function deploy({ appRoot, argv, env, runner, health = waitForHealth, guard = assertUatDeployable, now }) {
  assertHandRun('deploy.mjs', 'changes this machine\'s Docker environments', env)
  const options = parseOptions({
    environment: { type: 'string' },
    confirm: { type: 'string' },
  }, argv)
  const environment = options.environment
  assertEnvironment(environment)
  const uat = environment === 'uat'
  const app = readApp(appRoot)

  if (uat) {
    await guard(runner, { root: appRoot, confirm: options.confirm })
  } else if (options.confirm) {
    throw new Error('--confirm is only for uat.')
  }
  await ensureInitialised(runner, app, environment, { env, stateDir: stateDirectory(app.name, env) })

  const settings = loadEnvironment(environment, { app, env })
  if (uat && !existsSync(settings.backupDir)) mkdirSync(settings.backupDir, { recursive: true })

  const version = await currentVersion(runner, appRoot)
  const deployed = { sha: version.dirty ? `${version.sha}-dirty` : version.sha, ref: version.ref }
  console.log(`Deploying ${environment} from ${version.ref} (${version.sha.slice(0, 7)}${version.dirty ? ', with uncommitted changes' : ''}) using ${settings.envFile}.`)

  await ensureProxyNetwork(runner)
  const versionEnv = { DEPLOYED_SHA: deployed.sha, DEPLOYED_REF: deployed.ref }
  await composeChecked(runner, settings, ['build'], { inherit: true, env: versionEnv })

  let backupFolder = null
  const source = uat ? sourceMigrations(appRoot) : null
  if (uat) {
    await composeChecked(runner, settings, ['up', '--detach', '--wait', 'db'], { inherit: true, env: versionEnv, what: 'Starting the uat database' })
    if ((await checkUatMigrations(runner, settings, { source, approved: readApprovedEdits(appRoot) })).firstDeploy) {
      console.log('First uat deploy: the uat database has no schema yet, so there is nothing to back up. Skipping the pre-deploy backup.')
    } else {
      backupFolder = await takeBackup(runner, settings, { reason: 'deploy', now })
    }
  }

  try {
    await migrate(runner, settings, deployed)
  } catch (error) {
    console.error(`Deploy of ${environment} stopped at the migrate step. The previous API containers are still running.`)
    if (backupFolder) {
      console.error(`Pre-deploy backup: ${backupFolder}`)
      console.error('If migrations were partly applied, the owner decides whether to restore it.')
    }
    throw error
  } finally {
    if (uat) await recordUatFingerprints(runner, settings, source).catch((error) => console.warn(`Warning: could not record the migration fingerprints (${error.message}).`))
  }

  await composeChecked(runner, settings, ['up', '--detach', '--build', '--remove-orphans', '--wait'], { inherit: true, env: versionEnv })
  await startProxyIfNotRunning(runner, appRoot)

  if (!(await health(settings))) throw new Error(`The ${environment} API did not become healthy at ${settings.baseUrl}/api/health.`)

  if (uat) {
    await recordDeployment(runner, app, settings, version.sha, version.ref)
    if (settings.values.BACKUP_AUTO_PRUNE === 'true') {
      await pruneBackups({ appRoot, argv: ['--apply'], env, runner })
    }
  }

  console.log(`Deployed ${environment} at ${settings.baseUrl}`)
}
