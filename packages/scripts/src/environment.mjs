import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { runChecked } from './process.mjs'

export const environments = ['dev', 'uat']
export const proxyProject = 'traefik'
export const proxyNetwork = 'traefik'
export const placeholderPassword = 'CHANGE_ME'

export function assertEnvironment(environment) {
  if (!environments.includes(environment)) {
    throw new Error(`--environment takes ${environments.join(' or ')}, not '${environment ?? ''}'.`)
  }
}

export function stateDirectory(name, env = process.env, home = homedir()) {
  return env.CLAUDALISK_APP_STATE ? resolve(env.CLAUDALISK_APP_STATE) : join(home, '.claudalisk', 'apps', name)
}

export function projectFor(app, environment) {
  assertEnvironment(environment)
  return environment === 'uat' ? app.uat.composeProject : `${app.name}-dev`
}

export function volumeFor(app, environment) {
  assertEnvironment(environment)
  return environment === 'uat' ? app.uat.volume : `${app.name}-dev_postgres-data`
}

export function parseEnvFile(text) {
  const values = {}
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) values[match[1]] = match[2]
  }
  return values
}

export function formatEnvFile(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`
}

export function newPassword(bytes = randomBytes(24)) {
  return bytes.toString('base64url')
}

export function envFileFromExample(exampleText, password, extra = {}) {
  const values = parseEnvFile(exampleText)
  for (const key of Object.keys(values)) values[key] = values[key].split(placeholderPassword).join(password)
  values.POSTGRES_PASSWORD = password
  return formatEnvFile({ ...values, ...extra })
}

export function databaseNameOf(connectionString) {
  const match = /(?:^|;)\s*(?:Database|Initial Catalog)\s*=\s*([^;]+)/i.exec(connectionString ?? '')
  return match ? match[1].trim() : null
}

export function resolveDatabases(app, values) {
  return app.databases.map((database) => {
    const fromConnection = databaseNameOf(values[database.envVar])
    const name = fromConnection ?? (app.databases.length === 1 ? values.POSTGRES_DB : null)
    if (!name) {
      throw new Error(`Cannot tell the name of the '${database.role}' database: set ${database.envVar} to its connection string in the env file${app.databases.length === 1 ? ' or set POSTGRES_DB' : ''}.`)
    }
    return { role: database.role, envVar: database.envVar, name }
  })
}

export function settingsFor(environment, { app, stateDir, values, proxyPort = '80' }) {
  assertEnvironment(environment)
  const hostName = `${app.hostPrefix}.${environment}.localhost`
  const envFile = join(stateDir, `${environment}.env`)
  const backupDir = join(stateDir, 'backups')
  return {
    app,
    environment,
    project: projectFor(app, environment),
    stateDir,
    envFile,
    backupDir,
    values,
    databases: resolveDatabases(app, values),
    hostName,
    proxyPort,
    baseUrl: proxyPort === '80' ? `http://${hostName}` : `http://${hostName}:${proxyPort}`,
    composeArgs: [
      'compose',
      '--project-name', projectFor(app, environment),
      '--project-directory', app.root,
      '-f', join(app.root, 'compose.base.yml'),
      '-f', join(app.root, `compose.${environment}.yml`),
      '--env-file', envFile,
    ],
    composeEnv: { APP_ENV_FILE: envFile, BACKUP_DIR: backupDir },
  }
}

export function devConnectionString(app, values, database) {
  return `Host=localhost;Port=${app.ports.devDb};Database=${database};Username=${values.POSTGRES_USER};Password=${values.POSTGRES_PASSWORD}`
}

export function missingEnvFileMessage(environment, envFile) {
  return environment === 'uat'
    ? `${envFile} does not exist. The owner creates it once with node scripts/init.mjs --environment uat; uat never falls back to an example file.`
    : `${envFile} does not exist. Deploy dev with node scripts/deploy.mjs --environment dev, which creates it.`
}

export function loadEnvironment(environment, { app, env = process.env, stateDir = stateDirectory(app.name, env) }) {
  assertEnvironment(environment)
  const envFile = join(stateDir, `${environment}.env`)
  if (!existsSync(envFile)) throw new Error(missingEnvFileMessage(environment, envFile))
  const values = parseEnvFile(readFileSync(envFile, 'utf8'))
  return settingsFor(environment, { app, stateDir, values, proxyPort: env.PROXY_PORT || '80' })
}

export async function volumeExists(runner, name) {
  const result = await runChecked(runner, 'docker', ['volume', 'ls', '--quiet', '--filter', `name=^${name}$`], { what: 'docker volume ls' })
  return result.stdout.trim().length > 0
}

export function compose(runner, settings, args, options = {}) {
  return runner('docker', [...settings.composeArgs, ...args], { ...options, env: { ...settings.composeEnv, ...options.env } })
}

export async function composeChecked(runner, settings, args, options = {}) {
  return runChecked(runner, 'docker', [...settings.composeArgs, ...args], {
    ...options,
    env: { ...settings.composeEnv, ...options.env },
    what: options.what ?? `docker compose ${args[0]}`,
  })
}

export async function runningContainer(runner, settings, service) {
  const result = await compose(runner, settings, ['ps', '--status', 'running', '--quiet', service])
  const id = result.code === 0 ? result.stdout.trim() : ''
  return id || null
}

export function deployedVersionFromEnv(lines) {
  const variables = {}
  for (const line of lines.split(/\r?\n/)) {
    const match = /^(DEPLOYED_SHA|DEPLOYED_REF)=(.*)$/.exec(line)
    if (match) variables[match[1]] = match[2]
  }
  if (!variables.DEPLOYED_SHA || variables.DEPLOYED_SHA === 'unknown') return null
  return { sha: variables.DEPLOYED_SHA, ref: variables.DEPLOYED_REF ?? null }
}

const envFormat = '{{range .Config.Env}}{{println .}}{{end}}'

export async function deployedVersion(runner, settings) {
  const listed = await compose(runner, settings, ['ps', '--all', '--quiet', 'api'])
  const container = listed.code === 0 ? listed.stdout.trim().split(/\r?\n/)[0] : ''
  if (container) {
    const inspected = await runner('docker', ['inspect', '--format', envFormat, container])
    const fromContainer = inspected.code === 0 ? deployedVersionFromEnv(inspected.stdout) : null
    if (fromContainer) return fromContainer
  }
  const image = await runner('docker', ['image', 'inspect', '--format', envFormat, `${settings.project}-api`])
  return image.code === 0 ? deployedVersionFromEnv(image.stdout) : null
}

export async function requireProxyRunning(runner) {
  const running = await runChecked(runner, 'docker', ['ps', '--quiet', '--filter', `label=com.docker.compose.project=${proxyProject}`], { what: 'docker ps' })
  if (!running.stdout.trim()) {
    throw new Error('Refusing to deploy: no shared proxy is running. Nothing was changed. Start it with /claudalisk:proxy up (or node "<plugin>/tools/proxy.mjs" up), then deploy again.')
  }
}
