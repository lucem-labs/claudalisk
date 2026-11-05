import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseEnvFile } from './environment.mjs'
import { fakeRunner } from './fake-runner.mjs'
import { ensureInitialised, initEnvironment } from './init.mjs'
import { sampleApp } from '../test/sample-app.mjs'

function withState(body) {
  return async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'shop-init-'))
    const root = mkdtempSync(join(tmpdir(), 'shop-root-'))
    writeFileSync(join(root, '.env.uat.example'), 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=CHANGE_ME\nBACKUP_AUTO_PRUNE=false\n')
    writeFileSync(join(root, '.env.dev.example'), 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=CHANGE_ME\nConnectionStrings__Shop=Host=db;Database=shop;Password=CHANGE_ME\n')
    try {
      await body(stateDir, { ...sampleApp, root })
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
      rmSync(root, { recursive: true, force: true })
    }
  }
}

function dockerWith(initial) {
  const volumes = new Set(initial)
  return fakeRunner((call) => {
    if (call.line.startsWith('docker volume ls')) {
      const name = call.args.at(-1).slice(6, -1)
      return { stdout: volumes.has(name) ? `${name}
` : '' }
    }
    if (call.line.startsWith('docker volume rm ')) volumes.delete(call.args[2])
    if (call.line.startsWith('docker volume create ')) volumes.add(call.args[2])
    return {}
  })
}

const options = (stateDir) => ({ stateDir, password: 'pw-123' })
const uatVolume = 'shop-uat_postgres-data'
const devVolume = 'shop-dev_postgres-data'

test('init writes the whole env file with the new password, then creates the volume', withState(async (stateDir, app) => {
  const runner = dockerWith([])
  const envFile = await initEnvironment(runner, app, 'uat', options(stateDir))
  const values = parseEnvFile(readFileSync(envFile, 'utf8'))
  assert.equal(values.POSTGRES_PASSWORD, 'pw-123')
  assert.equal(values.POSTGRES_DB, 'shop')
  assert.equal(values.BACKUP_AUTO_PRUNE, 'false')
  assert.equal(values.DEV_POSTGRES_PORT, undefined)
  if (process.platform !== 'win32') assert.equal(statSync(envFile).mode & 0o777, 0o600)
  assert.deepEqual(runner.calls.at(-1).args, ['volume', 'create', uatVolume])
}))

test('init generates a long random password by default', withState(async (stateDir, app) => {
  const envFile = await initEnvironment(dockerWith([]), app, 'dev', { stateDir })
  const values = parseEnvFile(readFileSync(envFile, 'utf8'))
  assert.ok(values.POSTGRES_PASSWORD.length >= 24)
  assert.equal(values.DEV_POSTGRES_PORT, '5440')
  assert.equal(values.ConnectionStrings__Shop, `Host=db;Database=shop;Password=${values.POSTGRES_PASSWORD}`)
}))

test('init refuses and changes nothing when the env file exists', withState(async (stateDir, app) => {
  writeFileSync(join(stateDir, 'uat.env'), 'KEEP=1\n')
  const runner = dockerWith([])
  await assert.rejects(initEnvironment(runner, app, 'uat', options(stateDir)), /already exists/)
  assert.equal(readFileSync(join(stateDir, 'uat.env'), 'utf8'), 'KEEP=1\n')
  assert.ok(!runner.calls.some((call) => call.line.startsWith('docker volume create')))
}))

test('init refuses and changes nothing when the volume exists', withState(async (stateDir, app) => {
  const runner = dockerWith([uatVolume])
  await assert.rejects(initEnvironment(runner, app, 'uat', options(stateDir)), /already exists/)
  assert.equal(existsSync(join(stateDir, 'uat.env')), false)
  assert.ok(!runner.calls.some((call) => call.line.startsWith('docker volume create')))
}))

test('init removes the env file when the volume cannot be created', withState(async (stateDir, app) => {
  const runner = fakeRunner((call) => (call.line.startsWith('docker volume create') ? { code: 1, stderr: 'no docker' } : {}))
  await assert.rejects(initEnvironment(runner, app, 'dev', options(stateDir)))
  assert.equal(existsSync(join(stateDir, 'dev.env')), false)
}))

test('a deploy leaves an initialised environment alone', withState(async (stateDir, app) => {
  writeFileSync(join(stateDir, 'uat.env'), 'A=1\n')
  const runner = dockerWith([uatVolume])
  await ensureInitialised(runner, app, 'uat', options(stateDir))
  assert.equal(runner.calls.length, 1)
}))

test('a uat deploy refuses every half-initialised state and names the init script', withState(async (stateDir, app) => {
  const none = dockerWith([])
  await assert.rejects(ensureInitialised(none, app, 'uat', options(stateDir)), /node scripts\/init\.mjs --environment uat/)
  const volumeOnly = dockerWith([uatVolume])
  await assert.rejects(ensureInitialised(volumeOnly, app, 'uat', options(stateDir)), /volume .* exists but .* does not/)
  writeFileSync(join(stateDir, 'uat.env'), 'A=1\n')
  const fileOnly = dockerWith([])
  await assert.rejects(ensureInitialised(fileOnly, app, 'uat', options(stateDir)), /node scripts\/init\.mjs --environment uat/)
  for (const runner of [none, volumeOnly, fileOnly]) {
    assert.ok(!runner.calls.some((call) => /volume (create|rm)|down/.test(call.line)))
  }
  assert.equal(readFileSync(join(stateDir, 'uat.env'), 'utf8'), 'A=1\n')
}))

test('the first dev deploy runs init', withState(async (stateDir, app) => {
  const runner = dockerWith([])
  await ensureInitialised(runner, app, 'dev', options(stateDir))
  assert.equal(parseEnvFile(readFileSync(join(stateDir, 'dev.env'), 'utf8')).POSTGRES_PASSWORD, 'pw-123')
  assert.ok(runner.calls.some((call) => call.line === `docker volume create ${devVolume}`))
}))

test('dev with a volume but no dev.env stops the stack, removes only the dev volume and runs init', withState(async (stateDir, app) => {
  const runner = dockerWith([devVolume])
  await ensureInitialised(runner, app, 'dev', options(stateDir))
  const lines = runner.calls.map((call) => call.line).filter((line) => /compose|volume (rm|create)/.test(line))
  assert.deepEqual(lines, [
    'docker compose --project-name shop-dev down --remove-orphans',
    `docker volume rm ${devVolume}`,
    `docker volume create ${devVolume}`,
  ])
  assert.ok(existsSync(join(stateDir, 'dev.env')))
}))

test('dev with a dev.env but no volume replaces the file and runs init', withState(async (stateDir, app) => {
  writeFileSync(join(stateDir, 'dev.env'), 'POSTGRES_PASSWORD=old\n')
  const runner = dockerWith([])
  await ensureInitialised(runner, app, 'dev', options(stateDir))
  assert.equal(parseEnvFile(readFileSync(join(stateDir, 'dev.env'), 'utf8')).POSTGRES_PASSWORD, 'pw-123')
  assert.ok(runner.calls.some((call) => call.line === `docker volume create ${devVolume}`))
}))

test('init names the missing example file', withState(async (stateDir, app) => {
  await assert.rejects(initEnvironment(dockerWith([]), { ...app, root: join(stateDir, 'nowhere') }, 'dev', options(stateDir)), /.env.dev.example does not exist/)
}))
