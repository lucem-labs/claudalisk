import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { backup } from './backup.mjs'
import { deploy } from './deploy.mjs'
import { init } from './init.mjs'
import { findApiProject, migrate } from './migrate.mjs'
import { pruneBackups } from './prune-backups.mjs'
import { refreshDev } from './refresh-dev.mjs'
import { restore } from './restore.mjs'
import { fakeRunner } from '../fake-runner.mjs'
import { callsMatching, docker, makeApp, sha, writeBackup, writeEnvFile } from '../../test/fixture.mjs'
import { twoDatabaseApp } from '../../test/sample-app.mjs'

const healthy = async () => ({ status: 'ok' })
const unhealthy = async () => null
const approvedGuard = async () => sha
const noGuard = async () => {
  throw new Error('the guard must not run')
}
const when = () => new Date('2026-10-29T10:00:00Z')

const handRun = [
  ['deploy', deploy, ['--environment', 'dev']],
  ['backup', backup, []],
  ['restore', restore, ['--environment', 'dev', '--backup', 'latest']],
  ['prune-backups', pruneBackups, []],
  ['refresh-dev', refreshDev, []],
  ['init', init, ['--environment', 'dev']],
  ['migrate', migrate, []],
]

for (const [name, command, argv] of handRun) {
  for (const variable of ['CI', 'GITHUB_ACTIONS']) {
    test(`${name} refuses to run when ${variable} is set, before it reads or runs anything`, async () => {
      const runner = fakeRunner()
      await assert.rejects(command({ appRoot: join(makeApp().root, 'missing'), argv, env: { [variable]: 'true' }, runner }), /is run by hand only, never in CI\./)
      assert.equal(runner.calls.length, 0)
    })
  }
}

test('init creates the dev env file and volume from the config', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  await init({ appRoot: root, argv: ['--environment', 'dev'], env, runner })
  assert.ok(readFileSync(join(state, 'dev.env'), 'utf8').includes('DEV_POSTGRES_PORT=5440'))
  assert.equal(callsMatching(runner, /^docker volume create shop-dev_postgres-data$/).length, 1)
  await assert.rejects(init({ appRoot: root, argv: ['--environment', 'prod'], env, runner }), /dev or uat/)
})

test('a dev deploy initialises, builds, migrates, starts and waits for health', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state, networks: [], proxyRunning: false })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy, guard: noGuard })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(existsSync(join(state, 'dev.env')))
  assert.ok(at(/volume create/) < at(/network create traefik/))
  assert.ok(at(/network create traefik/) < at(/ build$/))
  assert.ok(at(/ build$/) < at(/--profile migrate run --rm migrate$/))
  assert.ok(at(/--profile migrate run --rm migrate$/) < at(/up --detach --build --remove-orphans --wait$/))
  assert.ok(at(/up --detach --build --remove-orphans --wait$/) < at(/compose.proxy.yml up --detach --wait$/))
  const build = callsMatching(runner, / build$/)[0]
  assert.equal(build.options.env.DEPLOYED_SHA, sha)
  assert.equal(build.options.env.DEPLOYED_REF, 'feature')
  assert.ok(build.args.includes('shop-dev'))
  assert.ok(build.args.includes(join(root, 'compose.dev.yml')))
  assert.equal(callsMatching(runner, /pg_dump/).length, 0)
  assert.equal(callsMatching(runner, /^gh /).length, 0)
})

test('a dev deploy of uncommitted changes marks the deployed commit dirty', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'], dirty: true })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy })
  assert.equal(callsMatching(runner, / build$/)[0].options.env.DEPLOYED_SHA, `${sha}-dirty`)
})

test('a dev deploy refuses a confirmation, and an unhealthy API fails the deploy', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'] })
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'dev', '--confirm', 'x'], env, runner, health: healthy }), /--confirm is only for uat/)
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: unhealthy }), /did not become healthy at http:\/\/shop\.dev\.localhost\/api\/health/)
})

test('a uat deploy stops at the guard before it touches Docker', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  runner.calls.length = 0
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy }), /Refusing to deploy uat: pass --confirm 'deploy uat 1234567'/)
  assert.ok(runner.calls.every((call) => call.command === 'git'))
})

function uatSetup({ hasSchema = true, applied = ['app/20260101000000_A'], failOn = [] } = {}) {
  const fixture = makeApp()
  writeEnvFile(fixture.state, 'uat', 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\nBACKUP_AUTO_PRUNE=false\n')
  const runner = docker({ state: fixture.state, volumes: ['shop-uat_postgres-data'], hasSchema, applied, failOn })
  return { ...fixture, runner }
}

test('a uat deploy of an existing database backs up first, with the deploy as the reason', async () => {
  const { root, state, env, runner } = uatSetup()
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/up --detach --wait db$/) < at(/pg_dump/))
  assert.ok(at(/pg_dump/) < at(/--profile migrate run --rm migrate$/))
  const [folder] = readdirSync(join(state, 'backups'))
  assert.equal(folder, `20261029T100000Z-${sha.slice(0, 7)}`)
  const manifest = JSON.parse(readFileSync(join(state, 'backups', folder, 'manifest.json'), 'utf8'))
  assert.equal(manifest.reason, 'deploy')
  assert.deepEqual(manifest.migrations, ['app/20260101000000_A'])
  assert.ok(callsMatching(runner, /^gh api --method POST repos\/acme\/shop\/deployments --input -$/).length === 1)
  assert.ok(callsMatching(runner, /repos\/acme\/shop\/deployments\/7\/statuses/).length === 1)
  assert.ok(existsSync(join(state, 'uat-migrations.json')))
})

test('a first uat deploy has nothing to back up', async () => {
  const { root, state, env, runner } = uatSetup({ hasSchema: false, applied: [] })
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard })
  assert.equal(callsMatching(runner, /pg_dump/).length, 0)
  assert.deepEqual(readdirSync(join(state, 'backups')), [])
})

test('a failed migration is reported with the pre-deploy backup and nothing is started', async () => {
  const { root, env, runner } = uatSetup({ failOn: ['run --rm migrate'] })
  const errors = []
  const original = console.error
  console.error = (message) => errors.push(message)
  try {
    await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when }), /Applying migrations to uat failed/)
  } finally {
    console.error = original
  }
  assert.ok(errors.some((message) => message.includes('Pre-deploy backup:')))
  assert.equal(callsMatching(runner, /--remove-orphans/).length, 0)
})

test('a uat deploy prunes backups after it when the env file asks for it', async () => {
  const { root, state, env, runner } = uatSetup()
  writeEnvFile(state, 'uat', 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\nBACKUP_AUTO_PRUNE=true\n')
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  assert.equal(callsMatching(runner, /ls-tree -r --name-only origin\/main/).length, 1)
})

test('a backup command names the reason in the manifest', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  const runner = docker({ state })
  await backup({ appRoot: root, argv: ['--reason', 'before the holiday'], env, runner, now: when })
  const [folder] = readdirSync(join(state, 'backups'))
  assert.equal(JSON.parse(readFileSync(join(state, 'backups', folder, 'manifest.json'), 'utf8')).reason, 'before the holiday')
  await backup({ appRoot: root, argv: [], env, runner, now: () => new Date('2026-10-29T10:00:05Z') })
  assert.equal(readdirSync(join(state, 'backups')).length, 2)
})

test('a backup command works while the API is down', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  const runner = docker({ state })
  await backup({ appRoot: root, argv: [], env, runner, now: when })
  assert.equal(readdirSync(join(state, 'backups'))[0], `20261029T100000Z-${sha.slice(0, 7)}`)
})

test('restore refuses uat without the owner and restores dev from the latest backup', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  writeEnvFile(state, 'dev')
  writeBackup(state, '20261001T000000Z-aaaaaaa', { createdAt: '2026-10-01T00:00:00Z' })
  const runner = docker({ state })
  await assert.rejects(restore({ appRoot: root, argv: ['--environment', 'uat', '--backup', '20261001T000000Z-aaaaaaa'], env, runner }), /only the owner restores uat/)
  assert.equal(runner.calls.length, 0)
  await restore({ appRoot: root, argv: ['--environment', 'dev', '--backup', 'latest', '--no-start'], env, runner, now: when })
  assert.ok(callsMatching(runner, /pg_restore/).length > 0)
  assert.ok(runner.calls.some((call) => (call.options.input ?? '').includes('RENAME TO "shop"')))
  assert.equal(callsMatching(runner, /start api$/).length, 0)
})

test('refresh-dev needs a deployed dev, restores the backup, migrates and starts the API', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  writeBackup(state, '20261001T000000Z-aaaaaaa', { createdAt: '2026-10-01T00:00:00Z' })
  const none = docker({ state, apiEnv: '' })
  await assert.rejects(refreshDev({ appRoot: root, argv: [], env, runner: none, health: healthy }), /Deploy dev first/)
  const runner = docker({ state })
  await refreshDev({ appRoot: root, argv: [], env, runner, health: healthy, now: when })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/stop api$/) < at(/--profile migrate run --rm migrate$/))
  assert.ok(at(/--profile migrate run --rm migrate$/) < at(/start api$/))
  await assert.rejects(refreshDev({ appRoot: root, argv: [], env, runner, health: unhealthy }), /did not become healthy after the refresh/)
})

test('refresh-dev --fresh takes a uat backup first, and refuses to be combined with --backup', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  writeEnvFile(state, 'uat')
  const runner = docker({ state })
  await assert.rejects(refreshDev({ appRoot: root, argv: ['--fresh', '--backup', 'x'], env, runner, health: healthy }), /do not combine/)
  await refreshDev({ appRoot: root, argv: ['--fresh'], env, runner, health: healthy, now: when })
  const [folder] = readdirSync(join(state, 'backups'))
  assert.equal(JSON.parse(readFileSync(join(state, 'backups', folder, 'manifest.json'), 'utf8')).reason, 'refresh-dev')
  assert.ok(callsMatching(runner, /pg_restore -U/).length > 0)
})

function pruneSetup() {
  const fixture = makeApp()
  writeEnvFile(fixture.state, 'uat')
  for (const day of ['01', '02', '03']) {
    writeBackup(fixture.state, `202610${day}T000000Z-aaaaaaa`, { createdAt: `2026-10-${day}T00:00:00Z`, migrations: ['app/20260101000000_A'] })
  }
  return fixture
}

test('prune-backups is a dry run unless --apply, and keeps the newest by the configured count', async () => {
  const { root, state, env } = pruneSetup()
  const runner = docker({ state, dbRunning: false })
  const dry = await pruneBackups({ appRoot: root, argv: ['--keep', '2'], env, runner })
  assert.deepEqual(dry.removed, ['20261001T000000Z-aaaaaaa'])
  assert.equal(readdirSync(join(state, 'backups')).length, 3)
  await pruneBackups({ appRoot: root, argv: ['--keep', '2', '--apply'], env, runner })
  assert.deepEqual(readdirSync(join(state, 'backups')).sort(), ['20261002T000000Z-aaaaaaa', '20261003T000000Z-aaaaaaa'])
})

test('prune-backups uses backup.keep from the config when no count is given', async () => {
  const { root, state, env } = pruneSetup()
  const config = JSON.parse(readFileSync(join(root, '.claude', 'claudalisk.json'), 'utf8'))
  writeFileSync(join(root, '.claude', 'claudalisk.json'), JSON.stringify({ ...config, backup: { keep: 1 } }))
  const result = await pruneBackups({ appRoot: root, argv: [], env, runner: docker({ state, dbRunning: false }) })
  assert.equal(result.kept.length, 1)
  await assert.rejects(pruneBackups({ appRoot: root, argv: ['--keep', '0'], env, runner: docker({ state }) }), /whole number of at least 1/)
})

test('prune-backups keeps the restore point from before a migration uat has and main lacks', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  writeBackup(state, '20261001T000000Z-aaaaaaa', { createdAt: '2026-10-01T00:00:00Z', migrations: ['app/20261001000000_A'] })
  writeBackup(state, '20261002T000000Z-aaaaaaa', { createdAt: '2026-10-02T00:00:00Z', migrations: ['app/20261001000000_A', 'app/20261002000000_B'] })
  writeBackup(state, '20261003T000000Z-aaaaaaa', { createdAt: '2026-10-03T00:00:00Z', migrations: ['app/20261001000000_A', 'app/20261002000000_B'] })
  const main = 'backend/Shop.Api/Migrations/20261001000000_A.cs'
  const runner = docker({
    state,
    applied: ['app/20261001000000_A', 'app/20261002000000_B'],
    extra: (call) => {
      if (call.line.includes('ls-tree')) return { stdout: `${main}\n` }
      if (call.line.includes('git -C') && call.line.includes(' show ')) return { stdout: '[Migration("20261001000000_A")]' }
      return undefined
    },
  })
  const result = await pruneBackups({ appRoot: root, argv: ['--keep', '1'], env, runner })
  assert.deepEqual(result.removed, ['20261002T000000Z-aaaaaaa'])
  assert.deepEqual(result.kept.sort(), ['20261001T000000Z-aaaaaaa', '20261003T000000Z-aaaaaaa'])
})

test('migrate finds the one API project and points each database variable at dev', async () => {
  const { root, state, env } = makeApp({ config: twoDatabaseApp })
  writeEnvFile(state, 'dev', 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\nConnectionStrings__Shop=Database=a\nConnectionStrings__Identity=Database=b\n')
  mkdirSync(join(root, 'backend', 'Shop.Api'), { recursive: true })
  writeFileSync(join(root, 'backend', 'Shop.Api', 'Shop.Api.csproj'), '')
  const runner = docker({ state })
  await migrate({ appRoot: root, argv: [], env, runner })
  const [call] = callsMatching(runner, /^dotnet run/)
  assert.deepEqual(call.args, ['run', '--project', join('backend', 'Shop.Api', 'Shop.Api.csproj'), '--', '--initialize-databases'])
  assert.equal(call.options.cwd, root)
  assert.equal(call.options.env.ConnectionStrings__Shop, 'Host=localhost;Port=5440;Database=a;Username=app;Password=pw')
  assert.equal(call.options.env.ConnectionStrings__Identity, 'Host=localhost;Port=5440;Database=b;Username=app;Password=pw')
})

test('migrate keeps a connection string already in the environment, and a --project override', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state })
  await migrate({ appRoot: root, argv: ['--project', 'x/y.csproj'], env: { ...env, ConnectionStrings__Shop: 'Host=elsewhere' }, runner })
  const [call] = callsMatching(runner, /^dotnet run/)
  assert.equal(call.args[2], 'x/y.csproj')
  assert.equal(call.options.env.ConnectionStrings__Shop, 'Host=elsewhere')
})

test('migrate fails when the dotnet run fails', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  mkdirSync(join(root, 'backend', 'Shop.Api'), { recursive: true })
  writeFileSync(join(root, 'backend', 'Shop.Api', 'Shop.Api.csproj'), '')
  await assert.rejects(migrate({ appRoot: root, argv: [], env, runner: docker({ state, failOn: ['dotnet run'] }) }), /Database migration failed/)
})

test('the API project is the one backend folder ending in .Api with its csproj', () => {
  const { root } = makeApp()
  assert.throws(() => findApiProject(root), /Found 0 API projects.*--project/)
  for (const name of ['Shop.Api', 'Other.Api', 'Shop.Domain']) {
    mkdirSync(join(root, 'backend', name), { recursive: true })
    writeFileSync(join(root, 'backend', name, `${name}.csproj`), '')
  }
  assert.throws(() => findApiProject(root), /Found 2 API projects/)
  rmSync(join(root, 'backend', 'Other.Api', 'Other.Api.csproj'))
  mkdirSync(join(root, 'backend', 'Empty.Api'))
  assert.equal(findApiProject(root), join('backend', 'Shop.Api', 'Shop.Api.csproj'))
})
