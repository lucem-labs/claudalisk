import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertEnvironment,
  envFileFromExample,
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

export async function initEnvironment(runner, app, environment, { env = process.env, stateDir = stateDirectory(app.name, env), password = newPassword() } = {}) {
  const volume = volumeFor(app, environment)
  const envFile = join(stateDir, `${environment}.env`)
  const hasEnvFile = existsSync(envFile)
  const hasVolume = await volumeExists(runner, volume)
  if (hasEnvFile || hasVolume) {
    const present = [hasEnvFile ? envFile : null, hasVolume ? `the volume ${volume}` : null].filter(Boolean).join(' and ')
    throw new Error(`${present} already exists; init changes nothing.`)
  }
  const example = join(app.root, `.env.${environment}.example`)
  if (!existsSync(example)) throw new Error(`${example} does not exist; init builds the env file from it.`)
  const extra = environment === 'dev' ? { DEV_POSTGRES_PORT: String(app.ports.devDb) } : {}
  const text = envFileFromExample(readFileSync(example, 'utf8'), password, extra)
  mkdirSync(environment === 'uat' ? join(stateDir, 'backups') : stateDir, { recursive: true })
  writeFileSync(envFile, text, { mode: 0o600, flag: 'wx' })
  try {
    await runChecked(runner, 'docker', ['volume', 'create', volume], { what: `Creating volume ${volume}` })
  } catch (error) {
    rmSync(envFile, { force: true })
    throw error
  }
  console.log(`Created ${envFile} with a new random password and the volume ${volume}.`)
  return envFile
}

export async function ensureInitialised(runner, app, environment, { env = process.env, stateDir = stateDirectory(app.name, env), password } = {}) {
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
    console.log(`${envFile} does not exist but the dev volume ${volume} does; dev is disposable, so the volume is removed.`)
    await runChecked(runner, 'docker', ['compose', '--project-name', projectFor(app, environment), 'down', '--remove-orphans'], { what: 'Stopping the dev stack' })
    await runChecked(runner, 'docker', ['volume', 'rm', volume], { what: `Removing volume ${volume}` })
  } else if (hasEnvFile) {
    console.log(`${envFile} exists but the dev volume ${volume} does not; dev is disposable, so the file is replaced.`)
    rmSync(envFile, { force: true })
  }
  await initEnvironment(runner, app, environment, options)
}
