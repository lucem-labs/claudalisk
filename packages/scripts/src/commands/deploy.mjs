import { existsSync, mkdirSync } from 'node:fs'
import { readAppVersion } from '../app-version.mjs'
import { assertEnvironment, composeChecked, deployedEnv, expectedProxyPort, requireProxyRunning, stateDirectory } from '../environment.mjs'
import { environmentCommand } from '../environment-command.mjs'
import { assertUatDeployable } from '../guards.mjs'
import { waitForHealth } from '../http.mjs'
import { holdReplacedImages, keepCurrentAndPreviousImages, requireDefaultImageNames } from '../images.mjs'
import { ensureInitialised } from '../init.mjs'
import { checkUatMigrations, fetchMain, readApprovedEdits, readMainMigrations, recordUatFingerprints, sourceMigrations } from '../migration-checks.mjs'
import { migrate, takeBackup } from '../operations.mjs'
import { runChecked } from '../process.mjs'

export async function currentVersion(runner, root) {
  const git = async (args) => (await runChecked(runner, 'git', ['-C', root, ...args])).stdout.trim()
  const sha = await git(['rev-parse', 'HEAD'])
  let ref = await git(['branch', '--show-current'])
  if (!ref) {
    const remotes = (await git(['branch', '--remotes', '--points-at', 'HEAD']))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.includes(' -> '))
    ref = remotes[0] ?? 'detached'
  }
  const dirty = (await git(['status', '--porcelain'])).length > 0
  return { sha, ref, dirty }
}

async function recordDeployment(runner, app, settings, { sha, ref, version }) {
  try {
    const created = await runChecked(runner, 'gh', ['api', '--method', 'POST', `repos/${app.repo}/deployments`, '--input', '-'], {
      cwd: app.root,
      input: JSON.stringify({ ref: sha, environment: settings.environment, auto_merge: false, required_contexts: [], description: `Local deploy of ${version ? `${version} from ` : ''}${ref}` }),
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

async function keepImages(runner, settings, held, version, env) {
  try {
    const reclaimed = await keepCurrentAndPreviousImages(runner, settings, held, version, env)
    console.log(`Kept the current and previous ${settings.project} images and removed the older ones${reclaimed ? ` (${reclaimed} reclaimed)` : ''}.`)
  } catch (error) {
    console.warn(`Warning: the older ${settings.project} images were not removed (${error.message}).`)
  }
}

export const deploy = environmentCommand({
  script: 'deploy.mjs',
  changes: "changes this machine's Docker environments",
  options: {
    environment: { type: 'string' },
    confirm: { type: 'string' },
    'adopt-unrecorded-migrations': { type: 'boolean', default: false },
    'recreate-dev-volume': { type: 'boolean', default: false },
  },
  run: runDeploy,
})

async function runDeploy({ app, appRoot, env, options, runner, settings: settingsOf, health = waitForHealth, guard = assertUatDeployable, now }) {
  const environment = options.environment
  assertEnvironment(environment)
  const uat = environment === 'uat'
  if (uat && options['recreate-dev-volume']) throw new Error('--recreate-dev-volume is only for dev.')

  let guarded = null
  if (uat) {
    guarded = await guard(runner, { root: appRoot, repo: app.repo, confirm: options.confirm })
  } else if (options.confirm) {
    throw new Error('--confirm is only for uat.')
  } else if (options['adopt-unrecorded-migrations']) {
    throw new Error('--adopt-unrecorded-migrations is only for uat.')
  }
  await requireProxyRunning(runner, expectedProxyPort(env))
  await ensureInitialised(runner, app, environment, { env, stateDir: stateDirectory(app.name, env), recreateDevVolume: options['recreate-dev-volume'] })

  const settings = settingsOf(environment)
  if (uat && !existsSync(settings.backupDir)) mkdirSync(settings.backupDir, { recursive: true })

  const version = await currentVersion(runner, appRoot)
  if (uat && (version.sha !== guarded || version.dirty)) {
    throw new Error(`Refusing to deploy uat: the working tree changed after the checks passed on ${String(guarded).slice(0, 7)} (now ${version.sha.slice(0, 7)}${version.dirty ? ', with uncommitted changes' : ''}). Nothing was changed; deploy again.`)
  }
  const appVersion = readAppVersion(appRoot)
  const deployed = { sha: version.dirty ? `${version.sha}-dirty` : version.sha, ref: version.ref, version: appVersion }
  console.log(`Deploying ${environment}${appVersion ? ` ${appVersion}` : ''} from ${version.ref} (${version.sha.slice(0, 7)}${version.dirty ? ', with uncommitted changes' : ''}) using ${settings.envFile}.`)

  const versionEnv = deployedEnv(deployed)
  await requireDefaultImageNames(runner, settings, versionEnv)
  let held = []
  const build = async () => {
    held = await holdReplacedImages(runner, settings)
    await composeChecked(runner, settings, ['--profile', 'migrate', 'build'], { inherit: true, env: versionEnv })
  }

  let backupFolder = null
  const source = uat ? sourceMigrations(appRoot) : null
  if (uat) {
    await fetchMain(runner, appRoot, { strict: true })
    await composeChecked(runner, settings, ['up', '--detach', '--wait', 'db'], { inherit: true, env: versionEnv, what: 'Starting the uat database' })
    const approved = await readApprovedEdits(runner, appRoot)
    const main = await readMainMigrations(runner, appRoot)
    const { firstDeploy } = await checkUatMigrations(runner, settings, {
      source,
      approved,
      main,
      adoptUnrecorded: options['adopt-unrecorded-migrations'],
    })
    await build()
    if (firstDeploy) {
      console.log('First uat deploy: the uat database has no schema yet, so there is nothing to back up. Skipping the pre-deploy backup.')
    } else {
      backupFolder = await takeBackup(runner, settings, { reason: 'deploy', now, main })
    }
  } else {
    await build()
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

  await composeChecked(runner, settings, ['up', '--detach', '--no-build', '--remove-orphans', '--wait'], { inherit: true, env: versionEnv })

  if (!(await health(settings))) throw new Error(`The ${environment} API did not become healthy at ${settings.baseUrl}/api/health.`)

  if (uat) await recordDeployment(runner, app, settings, { sha: version.sha, ref: version.ref, version: appVersion })
  await keepImages(runner, settings, held, appVersion, versionEnv)

  console.log(`Deployed ${environment} at ${settings.baseUrl}`)
}
