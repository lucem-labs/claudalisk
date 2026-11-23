import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseEnvFile } from './environment.mjs'
import { fakeRunner } from './fake-runner.mjs'
import { adoptVolume, ensureInitialised, initEnvironment, otherAppWithVolume } from './init.mjs'
import { sampleApp } from '../test/sample-app.mjs'

function withState(body) {
  return async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'shop-init-'))
    const root = mkdtempSync(join(tmpdir(), 'shop-root-'))
    writeFileSync(join(root, '.env.uat.example'), 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=CHANGE_ME\nAPP_ENVIRONMENT=uat\n')
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

const options = (stateDir) => ({ stateDir, password: 'pw-123', home: stateDir })
const uatVolume = 'shop-uat_postgres-data'
const devVolume = 'shop-dev_postgres-data'

test('init writes the whole env file with the new password, then creates the volume', withState(async (stateDir, app) => {
  const runner = dockerWith([])
  const envFile = await initEnvironment(runner, app, 'uat', options(stateDir))
  const values = parseEnvFile(readFileSync(envFile, 'utf8'))
  assert.equal(values.POSTGRES_PASSWORD, 'pw-123')
  assert.equal(values.POSTGRES_DB, 'shop')
  assert.equal(values.APP_ENVIRONMENT, 'uat')
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

test('a dev deploy with a volume but no dev.env refuses, keeps the volume and names both ways forward', withState(async (stateDir, app) => {
  const runner = dockerWith([devVolume])
  await assert.rejects(
    ensureInitialised(runner, app, 'dev', options(stateDir)),
    /dev volume shop-dev_postgres-data exists but .*dev\.env does not.*Nothing was changed.*--environment dev --adopt-volume.*--recreate-dev-volume/,
  )
  assert.ok(!runner.calls.some((call) => /volume (create|rm)|down/.test(call.line)))
  assert.equal(existsSync(join(stateDir, 'dev.env')), false)
}))

test('dev with a volume but no dev.env and --recreate-dev-volume stops the stack, removes only the dev volume and runs init', withState(async (stateDir, app) => {
  const runner = dockerWith([devVolume])
  await ensureInitialised(runner, app, 'dev', { ...options(stateDir), recreateDevVolume: true })
  const lines = runner.calls.map((call) => call.line).filter((line) => /compose|volume (rm|create)/.test(line))
  assert.deepEqual(lines, [
    'docker compose --project-name shop-dev down --remove-orphans',
    `docker volume rm ${devVolume}`,
    `docker volume create ${devVolume}`,
  ])
  assert.ok(existsSync(join(stateDir, 'dev.env')))
}))

test('with a configured dev volume, init checks, removes and creates that volume and leaves the default name alone', withState(async (stateDir, app) => {
  const configured = { ...app, dev: { volume: 'shop-dev_postgres-18' } }
  const refused = dockerWith([devVolume, 'shop-dev_postgres-18'])
  await assert.rejects(ensureInitialised(refused, configured, 'dev', options(stateDir)), /dev volume shop-dev_postgres-18 exists but .*dev\.env does not/)
  const runner = dockerWith([devVolume, 'shop-dev_postgres-18'])
  await ensureInitialised(runner, configured, 'dev', { ...options(stateDir), recreateDevVolume: true })
  assert.deepEqual(runner.calls.map((call) => call.line).filter((line) => /volume (rm|create)/.test(line)), [
    'docker volume rm shop-dev_postgres-18',
    'docker volume create shop-dev_postgres-18',
  ])
  const fresh = dockerWith([devVolume])
  rmSync(join(stateDir, 'dev.env'))
  await ensureInitialised(fresh, configured, 'dev', options(stateDir))
  assert.ok(fresh.calls.some((call) => call.line === 'docker volume create shop-dev_postgres-18'))
  assert.ok(!fresh.calls.some((call) => call.line.includes(`volume rm ${devVolume}`)))
}))

function registryIn(home, registry) {
  mkdirSync(join(home, '.claudalisk'), { recursive: true })
  writeFileSync(join(home, '.claudalisk', 'apps.json'), typeof registry === 'string' ? registry : JSON.stringify(registry))
}

const blog = { name: 'blog', uat: { composeProject: 'blog-uat', volume: 'blog-uat-data', protectedVolumes: ['blog-old-data'] } }

test('--recreate-dev-volume never removes a volume the machine registry lists for another app', withState(async (stateDir, app) => {
  registryIn(stateDir, { apps: [{ name: 'shop', uat: { composeProject: 'shop-uat', volume: 'shop-uat_postgres-data' } }, blog, { name: 'news', dev: { volume: 'news-dev_postgres-18' }, uat: { composeProject: 'news-uat', volume: 'news-uat-data' } }] })
  const cases = [
    ['blog-uat-data', /holds the uat data of the app blog/],
    ['blog-old-data', /holds the uat data of the app blog/],
    ['blog-dev_postgres-data', /holds the dev data of the app blog/],
    ['news-dev_postgres-18', /holds the dev data of the app news/],
  ]
  for (const [volume, pattern] of cases) {
    const runner = dockerWith([volume])
    await assert.rejects(ensureInitialised(runner, { ...app, dev: { volume } }, 'dev', { ...options(stateDir), recreateDevVolume: true }), (error) => {
      assert.ok(error.message.startsWith(`Refusing to remove the volume ${volume}: `))
      assert.match(error.message, pattern)
      assert.match(error.message, /Nothing was changed\./)
      return true
    })
    assert.ok(!runner.calls.some((call) => /volume (rm|create)|down/.test(call.line)), volume)
    assert.equal(existsSync(join(stateDir, 'dev.env')), false)
  }
}))

test('--recreate-dev-volume removes the app\'s own dev volume when the registry lists it, and when there is no registry', withState(async (stateDir, app) => {
  registryIn(stateDir, { apps: [{ name: 'shop', dev: { volume: devVolume }, uat: { composeProject: 'shop-uat', volume: 'shop-uat_postgres-data' } }, blog] })
  const runner = dockerWith([devVolume])
  await ensureInitialised(runner, app, 'dev', { ...options(stateDir), recreateDevVolume: true })
  assert.ok(runner.calls.some((call) => call.line === `docker volume rm ${devVolume}`))
  assert.equal(otherAppWithVolume(devVolume, 'shop', { home: join(stateDir, 'no-such-home') }), null)
}))

test('a registry that is not JSON stops --recreate-dev-volume before anything is removed', withState(async (stateDir, app) => {
  registryIn(stateDir, '{ apps: [')
  const runner = dockerWith([devVolume])
  await assert.rejects(ensureInitialised(runner, app, 'dev', { ...options(stateDir), recreateDevVolume: true }), /apps\.json is not valid JSON .*cannot be checked against the other apps.*Nothing was changed\./)
  assert.ok(!runner.calls.some((call) => /volume rm|down/.test(call.line)))
}))

test('dev with a dev.env but no volume replaces the file and runs init', withState(async (stateDir, app) => {
  writeFileSync(join(stateDir, 'dev.env'), 'POSTGRES_PASSWORD=old\n')
  const runner = dockerWith([])
  await ensureInitialised(runner, app, 'dev', options(stateDir))
  assert.equal(parseEnvFile(readFileSync(join(stateDir, 'dev.env'), 'utf8')).POSTGRES_PASSWORD, 'pw-123')
  assert.ok(runner.calls.some((call) => call.line === `docker volume create ${devVolume}`))
}))

function adoptingDocker(initial, { connects = true } = {}) {
  const volumes = new Set(initial)
  return fakeRunner((call) => {
    if (call.line.startsWith('docker volume ls')) {
      const name = call.args.at(-1).slice(6, -1)
      return { stdout: volumes.has(name) ? `${name}\n` : '' }
    }
    if (call.line.includes(' run --rm --no-deps --entrypoint psql ') && !connects) {
      return { code: 2, stderr: 'psql: error: password authentication failed for user "app"' }
    }
    return {}
  })
}

const adopt = (stateDir, password = 'old-pw') => ({ env: { PROXY_PORT: '80' }, stateDir, askPassword: async () => password })

test('init --adopt-volume writes dev.env with the given password, then checks it connects over the network', withState(async (stateDir, app) => {
  const runner = adoptingDocker([devVolume])
  const envFile = await adoptVolume(runner, app, 'dev', adopt(stateDir))
  const values = parseEnvFile(readFileSync(envFile, 'utf8'))
  assert.equal(values.POSTGRES_PASSWORD, 'old-pw')
  assert.equal(values.DEV_POSTGRES_PORT, '5440')
  assert.equal(values.ConnectionStrings__Shop, 'Host=db;Database=shop;Password=old-pw')
  const composeCalls = runner.calls.filter((call) => call.args[0] === 'compose')
  assert.match(composeCalls[0].line, /--project-name shop-dev .* up --detach --wait db$/)
  const check = composeCalls[1]
  assert.match(check.line, / run --rm --no-deps --entrypoint psql --env PGPASSWORD db --host db --username app --dbname shop .*SELECT 1$/)
  assert.ok(!check.line.includes('old-pw'))
  assert.equal(check.options.env.PGPASSWORD, 'old-pw')
  assert.ok(!runner.calls.some((call) => /volume (create|rm)|down/.test(call.line)))
}))

test('init --adopt-volume removes dev.env and leaves the volume when the password does not connect', withState(async (stateDir, app) => {
  const runner = adoptingDocker([devVolume], { connects: false })
  await assert.rejects(adoptVolume(runner, app, 'dev', adopt(stateDir, 'wrong')), /password authentication failed[\s\S]*Could not adopt the volume shop-dev_postgres-data, so .*dev\.env was removed/)
  assert.equal(existsSync(join(stateDir, 'dev.env')), false)
  assert.ok(runner.calls.some((call) => / stop db$/.test(call.line)))
  assert.ok(!runner.calls.some((call) => /volume (create|rm)|down/.test(call.line)))
}))

test('init --adopt-volume refuses without asking for a password when there is nothing to adopt, or dev.env exists', withState(async (stateDir, app) => {
  const asked = []
  const askPassword = async (volume) => {
    asked.push(volume)
    return 'pw'
  }
  await assert.rejects(adoptVolume(adoptingDocker([]), app, 'dev', { stateDir, askPassword }), /volume shop-dev_postgres-data does not exist, so there is nothing to adopt.*without --adopt-volume/)
  writeFileSync(join(stateDir, 'dev.env'), 'KEEP=1\n')
  await assert.rejects(adoptVolume(adoptingDocker([devVolume]), app, 'dev', { stateDir, askPassword }), /already exists; init changes nothing/)
  assert.equal(readFileSync(join(stateDir, 'dev.env'), 'utf8'), 'KEEP=1\n')
  assert.deepEqual(asked, [])
}))

test('init --adopt-volume refuses uat and an empty password, and changes nothing', withState(async (stateDir, app) => {
  const runner = adoptingDocker([devVolume, uatVolume])
  await assert.rejects(adoptVolume(runner, app, 'uat', adopt(stateDir)), /--adopt-volume is only for dev/)
  await assert.rejects(adoptVolume(runner, app, 'dev', adopt(stateDir, '')), /needs the password the volume shop-dev_postgres-data was created with/)
  assert.equal(existsSync(join(stateDir, 'dev.env')), false)
  assert.equal(existsSync(join(stateDir, 'uat.env')), false)
  assert.ok(!runner.calls.some((call) => call.args[0] === 'compose'))
}))

test('init names the missing example file', withState(async (stateDir, app) => {
  await assert.rejects(initEnvironment(dockerWith([]), { ...app, root: join(stateDir, 'nowhere') }, 'dev', options(stateDir)), /.env.dev.example does not exist/)
}))
