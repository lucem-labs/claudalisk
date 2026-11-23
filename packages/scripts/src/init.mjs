import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  assertEnvironment,
  compose,
  composeChecked,
  envFileFromExample,
  loadEnvironment,
  newPassword,
  projectFor,
  stateDirectory,
  volumeExists,
  volumeFor,
} from './environment.mjs'
import { runChecked } from './process.mjs'

export function initCommand(environment) {
  return `node scripts/init.mjs --environment ${environment}`
}

function writeEnvFileFromExample(app, environment, stateDir, envFile, password) {
  const example = join(app.root, `.env.${environment}.example`)
  if (!existsSync(example)) throw new Error(`${example} does not exist; init builds the env file from it.`)
  const extra = environment === 'dev' ? { DEV_POSTGRES_PORT: String(app.ports.devDb) } : {}
  const text = envFileFromExample(readFileSync(example, 'utf8'), password, extra)
  mkdirSync(environment === 'uat' ? join(stateDir, 'backups') : stateDir, { recursive: true })
  writeFileSync(envFile, text, { mode: 0o600, flag: 'wx' })
}

export async function initEnvironment(runner, app, environment, { env = process.env, stateDir = stateDirectory(app.name, env), password = newPassword() } = {}) {
  const volume = volumeFor(app, environment)
  const envFile = join(stateDir, `${environment}.env`)
  const hasEnvFile = existsSync(envFile)
  const hasVolume = await volumeExists(runner, volume)
  if (hasEnvFile || hasVolume) {
    const present = [hasEnvFile ? envFile : null, hasVolume ? `the volume ${volume}` : null].filter(Boolean).join(' and ')
    throw new Error(`${present} already exists; init changes nothing.`)
  }
  writeEnvFileFromExample(app, environment, stateDir, envFile, password)
  try {
    await runChecked(runner, 'docker', ['volume', 'create', volume], { what: `Creating volume ${volume}` })
  } catch (error) {
    rmSync(envFile, { force: true })
    throw error
  }
  console.log(`Created ${envFile} with a new random password and the volume ${volume}.`)
  return envFile
}

export async function adoptVolume(runner, app, environment, { env = process.env, stateDir = stateDirectory(app.name, env), askPassword }) {
  if (environment !== 'dev') throw new Error('--adopt-volume is only for dev. The owner writes uat.env by hand with the password the uat volume was created with.')
  const volume = volumeFor(app, environment)
  const envFile = join(stateDir, `${environment}.env`)
  if (existsSync(envFile)) throw new Error(`${envFile} already exists; init changes nothing.`)
  if (!(await volumeExists(runner, volume))) {
    throw new Error(`The volume ${volume} does not exist, so there is nothing to adopt; init changes nothing. Run ${initCommand(environment)} without --adopt-volume to create it.`)
  }
  const password = await askPassword(volume)
  if (!password) throw new Error(`--adopt-volume needs the password the volume ${volume} was created with; init changes nothing.`)
  writeEnvFileFromExample(app, environment, stateDir, envFile, password)
  const settings = loadEnvironment(environment, { app, env, stateDir })
  const user = settings.values.POSTGRES_USER
  const database = settings.values.POSTGRES_DB || 'postgres'
  try {
    await composeChecked(runner, settings, ['up', '--detach', '--wait', 'db'], { what: 'Starting the dev database' })
    await composeChecked(runner, settings, ['run', '--rm', '--no-deps', '--entrypoint', 'psql', '--env', 'PGPASSWORD', 'db', '--host', 'db', '--username', user, '--dbname', database, '--no-psqlrc', '--tuples-only', '--command', 'SELECT 1'], {
      env: { PGPASSWORD: password },
      what: `Connecting to the dev database as ${user}`,
    })
  } catch (error) {
    await compose(runner, settings, ['stop', 'db']).catch(() => undefined)
    rmSync(envFile, { force: true })
    throw new Error(`${error.message}\nCould not adopt the volume ${volume}, so ${envFile} was removed and the volume was left as it was. Check the password, and that POSTGRES_USER and POSTGRES_DB in .env.dev.example match the volume.`)
  }
  console.log(`Created ${envFile} for the existing volume ${volume}, and connected to it with that password.`)
  return envFile
}

export function devVolumeWithoutEnvFileMessage(volume, envFile) {
  return `The dev volume ${volume} exists but ${envFile} does not, so a deploy would remove the volume and its data. Nothing was changed. Keep the data with ${initCommand('dev')} --adopt-volume, which asks for the volume's password, or start dev empty with node scripts/deploy.mjs --environment dev --recreate-dev-volume.`
}

const byteOrderMark = String.fromCharCode(0xfeff)

export function otherAppWithVolume(volume, appName, { home = homedir() } = {}) {
  const path = join(home, '.claudalisk', 'apps.json')
  if (!existsSync(path)) return null
  let registry
  try {
    const text = readFileSync(path, 'utf8')
    registry = JSON.parse(text.startsWith(byteOrderMark) ? text.slice(1) : text)
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${error.message}), so the volume ${volume} cannot be checked against the other apps on this machine. Nothing was changed.`)
  }
  for (const other of Array.isArray(registry?.apps) ? registry.apps : []) {
    if (!other || other.name === appName) continue
    const protectedVolumes = Array.isArray(other.uat?.protectedVolumes) ? other.uat.protectedVolumes : []
    if ([other.uat?.volume, ...protectedVolumes].includes(volume)) return { name: other.name, holds: 'uat data', path }
    if ((other.dev?.volume ?? `${other.name}-dev_postgres-data`) === volume) return { name: other.name, holds: 'dev data', path }
  }
  return null
}

export async function ensureInitialised(runner, app, environment, { env = process.env, stateDir = stateDirectory(app.name, env), password, recreateDevVolume = false, home = homedir() } = {}) {
  assertEnvironment(environment)
  const volume = volumeFor(app, environment)
  const envFile = join(stateDir, `${environment}.env`)
  const hasEnvFile = existsSync(envFile)
  const hasVolume = await volumeExists(runner, volume)
  if (hasEnvFile && hasVolume) return
  const options = { env, stateDir, password }

  if (environment === 'uat') {
    const detail =
      !hasEnvFile && !hasVolume
        ? `${envFile} and the volume ${volume} do not exist. The owner runs ${initCommand('uat')} once.`
        : hasEnvFile
          ? `${envFile} exists but the volume ${volume} does not. The owner restores the volume, or moves the file away and runs ${initCommand('uat')}.`
          : `The volume ${volume} exists but ${envFile} does not. The owner writes uat.env with the password the volume was created with.`
    throw new Error(`${detail} A deploy changes nothing.`)
  }

  if (hasVolume) {
    if (!recreateDevVolume) throw new Error(devVolumeWithoutEnvFileMessage(volume, envFile))
    const owner = otherAppWithVolume(volume, app.name, { home })
    if (owner) {
      throw new Error(`Refusing to remove the volume ${volume}: ${owner.path} lists it as a volume that holds the ${owner.holds} of the app ${owner.name}. Nothing was changed. Set dev.volume in .claude/claudalisk.json to this app's own dev volume, or correct the registry entry that is wrong.`)
    }
    console.log(`${envFile} does not exist but the dev volume ${volume} does, and --recreate-dev-volume was passed, so the volume is removed.`)
    await runChecked(runner, 'docker', ['compose', '--project-name', projectFor(app, environment), 'down', '--remove-orphans'], { what: 'Stopping the dev stack' })
    await runChecked(runner, 'docker', ['volume', 'rm', volume], { what: `Removing volume ${volume}` })
  } else if (hasEnvFile) {
    console.log(`${envFile} exists but the dev volume ${volume} does not; dev is disposable, so the file is replaced.`)
    rmSync(envFile, { force: true })
  }
  await initEnvironment(runner, app, environment, options)
}
