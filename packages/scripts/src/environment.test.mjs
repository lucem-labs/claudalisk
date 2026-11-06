import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  assertEnvironment,
  databaseNameOf,
  deployedVersion,
  deployedVersionFromEnv,
  devConnectionString,
  envFileFromExample,
  formatEnvFile,
  loadEnvironment,
  parseEnvFile,
  projectFor,
  resolveDatabases,
  settingsFor,
  stateDirectory,
  volumeFor,
} from './environment.mjs'
import { fakeRunner } from './fake-runner.mjs'
import { sampleApp, sampleValues, twoDatabaseApp } from '../test/sample-app.mjs'

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'shop-env-'))
}

test('the state lives in ~/.claudalisk/apps/shop unless overridden', () => {
  assert.equal(stateDirectory('shop', {}, '/home/owner'), join('/home/owner', '.claudalisk', 'apps', 'shop'))
  assert.equal(stateDirectory('shop', { CLAUDALISK_APP_STATE: '/tmp/state' }, '/home/owner'), resolve('/tmp/state'))
})

test('env files parse and format as KEY=value lines', () => {
  const values = parseEnvFile('POSTGRES_DB=shop\r\n# not a value\n  POSTGRES_USER = app \nbad line\nEMPTY=\n')
  assert.deepEqual(values, { POSTGRES_DB: 'shop', POSTGRES_USER: 'app', EMPTY: '' })
  assert.equal(formatEnvFile({ A: '1', B: 'two' }), 'A=1\nB=two\n')
})

test('an env file made from an example gets the new password and keeps the other keys', () => {
  const text = envFileFromExample('POSTGRES_DB=shop\nPOSTGRES_PASSWORD=CHANGE_ME\nDEV_POSTGRES_PORT=5434\n', 's3cret')
  assert.deepEqual(parseEnvFile(text), { POSTGRES_DB: 'shop', POSTGRES_PASSWORD: 's3cret', DEV_POSTGRES_PORT: '5434' })
})

test('only dev and uat are environments', () => {
  assert.doesNotThrow(() => assertEnvironment('dev'))
  assert.doesNotThrow(() => assertEnvironment('uat'))
  assert.throws(() => assertEnvironment('prod'), /dev or uat/)
})

test('uat settings point Compose at compose.uat.yml, the uat env file and the backups folder', () => {
  const settings = settingsFor('uat', { app: sampleApp, stateDir: '/state', values: sampleValues })
  assert.equal(settings.project, 'shop-uat')
  assert.equal(settings.baseUrl, 'http://shop.uat.localhost')
  assert.equal(settings.envFile, join('/state', 'uat.env'))
  assert.equal(settings.backupDir, join('/state', 'backups'))
  assert.deepEqual(settings.composeArgs.slice(1, 3), ['--project-name', 'shop-uat'])
  assert.deepEqual(settings.composeArgs.slice(-6), ['-f', join('/repo', 'compose.base.yml'), '-f', join('/repo', 'compose.uat.yml'), '--env-file', join('/state', 'uat.env')])
  assert.deepEqual(settings.composeEnv, { APP_ENV_FILE: join('/state', 'uat.env'), BACKUP_DIR: join('/state', 'backups') })
})

test('a proxy port other than 80 appears in the base URL', () => {
  assert.equal(settingsFor('dev', { app: sampleApp, stateDir: '/state', values: sampleValues, proxyPort: '8081' }).baseUrl, 'http://shop.dev.localhost:8081')
})

test('uat never falls back to an example file', () => {
  const stateDir = temporaryDirectory()
  try {
    assert.throws(() => loadEnvironment('uat', { app: sampleApp, stateDir, env: {} }), /uat\.env does not exist.*never falls back/)
    writeFileSync(join(stateDir, 'uat.env'), 'POSTGRES_DB=shop\n')
    assert.equal(loadEnvironment('uat', { app: sampleApp, stateDir, env: {} }).values.POSTGRES_DB, 'shop')
  } finally {
    rmSync(stateDir, { recursive: true, force: true })
  }
})

test('the deployed version comes from the API container environment', () => {
  assert.deepEqual(deployedVersionFromEnv('PATH=/bin\nDEPLOYED_SHA=abc1234def\nDEPLOYED_REF=main\n'), { sha: 'abc1234def', ref: 'main' })
  assert.equal(deployedVersionFromEnv('DEPLOYED_SHA=unknown\n'), null)
  assert.equal(deployedVersionFromEnv('PATH=/bin\n'), null)
})

test('a directly launched Host reaches the dev database on its published port', () => {
  assert.equal(
    devConnectionString(sampleApp, sampleValues, 'shop'),
    'Host=localhost;Port=5440;Database=shop;Username=app;Password=pw',
  )
})

test('the uat project and volume come from the config and dev ones from the name', () => {
  assert.equal(projectFor(sampleApp, 'uat'), 'shop-uat')
  assert.equal(projectFor(sampleApp, 'dev'), 'shop-dev')
  assert.equal(volumeFor(sampleApp, 'uat'), 'shop-uat_postgres-data')
  assert.equal(volumeFor(sampleApp, 'dev'), 'shop-dev_postgres-data')
})

test('the example placeholder is replaced wherever it appears', () => {
  const text = envFileFromExample('ConnectionStrings__Shop=Host=db;Password=CHANGE_ME\nPOSTGRES_PASSWORD=CHANGE_ME\n', 'pw1', { DEV_POSTGRES_PORT: '5440' })
  assert.deepEqual(parseEnvFile(text), { ConnectionStrings__Shop: 'Host=db;Password=pw1', POSTGRES_PASSWORD: 'pw1', DEV_POSTGRES_PORT: '5440' })
})

test('env files with a byte order mark parse', () => {
  assert.deepEqual(parseEnvFile('﻿POSTGRES_DB=shop\n'), { POSTGRES_DB: 'shop' })
})

test('the database name is read from the connection string', () => {
  assert.equal(databaseNameOf('Host=db;Database=shop_identity;Username=app'), 'shop_identity')
  assert.equal(databaseNameOf('Host=db;Initial Catalog=x'), 'x')
  assert.equal(databaseNameOf('Host=db'), null)
  assert.equal(databaseNameOf(undefined), null)
})

test('a single database falls back to POSTGRES_DB, several need their own connection strings', () => {
  assert.deepEqual(resolveDatabases(sampleApp, { POSTGRES_DB: 'shop' }), [{ role: 'app', envVar: 'ConnectionStrings__Shop', name: 'shop' }])
  assert.equal(resolveDatabases(sampleApp, { ConnectionStrings__Shop: 'Database=other', POSTGRES_DB: 'shop' })[0].name, 'other')
  assert.throws(() => resolveDatabases(twoDatabaseApp, { POSTGRES_DB: 'shop' }), /'app' database: set ConnectionStrings__Shop/)
  const both = resolveDatabases(twoDatabaseApp, { ConnectionStrings__Shop: 'Database=a', ConnectionStrings__Identity: 'Database=b' })
  assert.deepEqual(both.map((item) => item.name), ['a', 'b'])
})

const settings = settingsFor('uat', { app: sampleApp, stateDir: '/state', values: sampleValues })
const withEnv = 'PATH=/bin\nDEPLOYED_SHA=abc1234def\nDEPLOYED_REF=main\n'

test('the deployed version is read from a stopped API container', async () => {
  const runner = fakeRunner((call) => (call.args.includes('ps') ? { stdout: 'c1\n' } : { stdout: withEnv }))
  assert.deepEqual(await deployedVersion(runner, settings), { sha: 'abc1234def', ref: 'main' })
  assert.ok(runner.calls[0].args.includes('--all'))
  assert.equal(runner.calls.length, 2)
})

test('with no container the deployed version is read from the API image', async () => {
  const runner = fakeRunner((call) => (call.args[0] === 'image' ? { stdout: withEnv } : {}))
  assert.deepEqual(await deployedVersion(runner, settings), { sha: 'abc1234def', ref: 'main' })
  assert.deepEqual(runner.calls.at(-1).args.slice(0, 2), ['image', 'inspect'])
  assert.equal(runner.calls.at(-1).args.at(-1), 'shop-uat-api')
})

test('without a container or an image there is no deployed version', async () => {
  const runner = fakeRunner((call) => (call.args[0] === 'image' ? { code: 1 } : {}))
  assert.equal(await deployedVersion(runner, settings), null)
})
