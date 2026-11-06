import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createManifest, writeManifest } from './backups.mjs'
import { settingsFor } from './environment.mjs'
import { fakeRunner } from './fake-runner.mjs'
import { restore, takeBackup, timestamp } from './operations.mjs'
import { temporaryFolder } from '../test/fixture.mjs'
import { sampleApp, sampleValues, twoDatabaseApp } from '../test/sample-app.mjs'

const stateDir = mkdtempSync(join(tmpdir(), 'shop-ops-'))
after(() => rmSync(stateDir, { recursive: true, force: true }))
const name = '20261016T093005Z-3e38675'
const folder = join(stateDir, 'backups', name)
mkdirSync(folder, { recursive: true })
writeFileSync(join(folder, 'shop.dump'), 'dump')
writeManifest(folder, createManifest({
  environment: 'uat', reason: 'deploy', createdAt: new Date('2026-10-16T09:30:05Z'),
  databases: [{ role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: createHash('sha256').update('dump').digest('hex') }],
  migrations: [],
}))
const dev = settingsFor('dev', { app: sampleApp, stateDir, values: sampleValues })

function services(respond = () => ({})) {
  return fakeRunner((call) => {
    if (call.args.includes('ps') && call.args.includes('db')) return { stdout: 'db1\n' }
    if (call.args.includes('ps') && call.args.includes('api')) return { stdout: 'api1\n' }
    if (call.args[0] === 'inspect') return { stdout: 'DEPLOYED_SHA=1234567abcdef\nDEPLOYED_REF=feature\n' }
    return respond(call)
  })
}

test('a restore timestamp has no separators', () => {
  assert.equal(timestamp(new Date('2026-10-28T09:05:07.123Z')), '20261028090507')
})

test('a dev restore stops the API, swaps the database and can leave the API stopped', async () => {
  const runner = services()
  const selected = await restore(runner, dev, { backup: 'latest', noStart: true, now: () => new Date('2026-10-28T09:00:00Z') })
  assert.equal(selected.name, name)
  const lines = runner.calls.map((call) => call.line)
  assert.ok(lines.some((line) => line.endsWith('stop api')))
  assert.ok(runner.calls.some((call) => (call.options.input ?? '').includes('RENAME TO "shop"')))
  assert.ok(!lines.some((line) => line.endsWith('start api')))
})

test('a failed restore starts the API again and reports the database unchanged', async () => {
  const runner = services((call) => (call.args.some((argument) => argument.includes('pg_restore -U')) ? { code: 1, stderr: 'corrupt' } : {}))
  await assert.rejects(restore(runner, dev, { backup: name, now: () => new Date('2026-10-28T09:00:00Z') }), /shop is unchanged/)
  const lines = runner.calls.map((call) => call.line)
  assert.ok(lines.findIndex((line) => line.endsWith('start api')) > lines.findIndex((line) => line.endsWith('stop api')))
})

test('a uat restore is refused before anything runs without the owner', async () => {
  const runner = services()
  const uat = settingsFor('uat', { app: sampleApp, stateDir, values: sampleValues })
  await assert.rejects(restore(runner, uat, { backup: name, confirm: `restore uat ${name}` }), /only the owner/)
  assert.equal(runner.calls.length, 0)
})

const when = new Date('2026-10-29T10:00:00Z')

function backupRunner(settings, { apiEnv = 'DEPLOYED_SHA=1234567abcdef\nDEPLOYED_REF=feature\n', failDump = false, fail = () => false } = {}) {
  return fakeRunner((call) => {
    const text = call.args.join(' ')
    if (fail(text, call)) return { code: 1, stderr: 'boom' }
    if (call.args.includes('ps') && call.args.includes('db')) return { stdout: 'db1\n' }
    if (call.args.includes('ps') && call.args.includes('api')) return { stdout: apiEnv ? 'api1\n' : '' }
    if (call.args[0] === 'inspect') return { stdout: apiEnv }
    if (call.args[0] === 'image') return { code: 1 }
    if (text.includes('pg_dump')) {
      if (failDump) return { code: 1, stderr: 'boom' }
      const file = call.args.at(-1).replace('/backups/', '')
      writeFileSync(join(settings.backupDir, file), 'dump-' + call.args.at(-2))
      return {}
    }
    if (text.includes('pg_restore --list')) return { stdout: '1; 0 0 TABLE x\n2; 0 0 TABLE y\n' }
    if (call.options.input?.includes('gexec')) return { stdout: 'orders/20261001000000_A\n' }
    return {}
  })
}

function freshSettings(app, values) {
  const dir = temporaryFolder('shop-backup-')
  const settings = settingsFor('uat', { app, stateDir: dir, values })
  mkdirSync(settings.backupDir, { recursive: true })
  return settings
}

test('a backup is named by UTC time and commit and records the reason, databases and migrations', async () => {
  const settings = freshSettings(sampleApp, sampleValues)
  const folderPath = await takeBackup(backupRunner(settings), settings, { reason: 'deploy', now: () => when })
  assert.equal(folderPath, join(settings.backupDir, '20261029T100000Z-1234567'))
  const manifest = JSON.parse(readFileSync(join(folderPath, 'manifest.json'), 'utf8'))
  assert.equal(manifest.reason, 'deploy')
  assert.equal(manifest.deployedSha, '1234567abcdef')
  assert.equal(manifest.deployedRef, 'feature')
  assert.deepEqual(manifest.migrations, ['orders/20261001000000_A'])
  assert.equal(manifest.databases.length, 1)
  assert.equal(manifest.databases[0].role, 'app')
  assert.equal(manifest.databases[0].file, 'shop.dump')
  assert.equal(manifest.databases[0].sha256, createHash('sha256').update('dump-shop').digest('hex'))
})

test('a backup works while the API is down, reading the commit from its stopped container', async () => {
  const settings = freshSettings(sampleApp, sampleValues)
  const runner = backupRunner(settings)
  await takeBackup(runner, settings, { now: () => when })
  assert.ok(runner.calls.some((call) => call.args.includes('--all') && call.args.includes('api')))
  assert.ok(!runner.calls.some((call) => call.args.includes('stop')))
})

test('a backup whose commit cannot be read is named unknown', async () => {
  const settings = freshSettings(sampleApp, sampleValues)
  const folderPath = await takeBackup(backupRunner(settings, { apiEnv: '' }), settings, { now: () => when })
  assert.equal(folderPath, join(settings.backupDir, '20261029T100000Z-unknown'))
  const manifest = JSON.parse(readFileSync(join(folderPath, 'manifest.json'), 'utf8'))
  assert.equal(manifest.deployedSha, null)
  assert.equal(manifest.reason, 'manual')
})

test('a backup of two databases dumps and records each', async () => {
  const values = { ...sampleValues, ConnectionStrings__Shop: 'Database=shop_a', ConnectionStrings__Identity: 'Database=shop_b' }
  const settings = freshSettings(twoDatabaseApp, values)
  const folderPath = await takeBackup(backupRunner(settings), settings, { now: () => when })
  const manifest = JSON.parse(readFileSync(join(folderPath, 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest.databases.map((item) => [item.role, item.database, item.file]), [['app', 'shop_a', 'shop_a.dump'], ['identity', 'shop_b', 'shop_b.dump']])
})

test('a failed dump leaves no folder behind', async () => {
  const settings = freshSettings(sampleApp, sampleValues)
  await assert.rejects(takeBackup(backupRunner(settings, { failDump: true }), settings, { now: () => when }), /pg_dump/)
  assert.equal(existsSync(join(settings.backupDir, '20261029T100000Z-1234567')), false)
})

test('a backup needs the database running', async () => {
  const settings = freshSettings(sampleApp, sampleValues)
  await assert.rejects(takeBackup(fakeRunner(), settings), /database is not running/)
})

test('a restore puts each database of the backup back by its role', async () => {
  const dir = temporaryFolder('shop-restore-')
  const values = { ...sampleValues, ConnectionStrings__Shop: 'Database=dev_a', ConnectionStrings__Identity: 'Database=dev_b' }
  const target = settingsFor('dev', { app: twoDatabaseApp, stateDir: dir, values })
  const folderPath = join(dir, 'backups', name)
  mkdirSync(folderPath, { recursive: true })
  const databases = ['app', 'identity'].map((role, index) => {
    const file = `uat_${index}.dump`
    writeFileSync(join(folderPath, file), role)
    return { role, database: `uat_${index}`, file, sizeBytes: Buffer.byteLength(role), sha256: createHash('sha256').update(role).digest('hex') }
  })
  writeManifest(folderPath, createManifest({ environment: 'uat', reason: 'deploy', createdAt: new Date('2026-10-16T09:30:05Z'), databases, migrations: [] }))
  const runner = services()
  await restore(runner, target, { backup: name, noStart: true, now: () => new Date('2026-10-28T09:00:00Z') })
  const sql = runner.calls.map((call) => call.options.input ?? '').join('\n')
  assert.match(sql, /RENAME TO "dev_a"/)
  assert.match(sql, /RENAME TO "dev_b"/)
})

const quietly = async (action) => {
  const log = console.log
  const error = console.error
  const messages = []
  console.log = (message) => messages.push(message)
  console.error = (message) => messages.push(message)
  try {
    return { messages, result: await action().then((value) => ({ value }), (reason) => ({ reason })) }
  } finally {
    console.log = log
    console.error = error
  }
}

const position = (runner, text) => runner.calls.findIndex((call) => call.line.includes(text) || (call.options.input ?? '').includes(text))

function uatTarget() {
  const settings = freshSettings(sampleApp, sampleValues)
  const folderPath = join(settings.backupDir, name)
  mkdirSync(folderPath, { recursive: true })
  writeFileSync(join(folderPath, 'shop.dump'), 'dump')
  writeManifest(folderPath, createManifest({
    environment: 'uat', reason: 'deploy', createdAt: new Date('2026-10-16T09:30:05Z'),
    databases: [{ role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: createHash('sha256').update('dump').digest('hex') }],
    migrations: [],
  }))
  return settings
}

const owner = { backup: name, ownerApproved: true, confirm: `restore uat ${name}`, now: () => when }

test('a restore stops the API, backs up uat, swaps, migrates and only then starts the API', async () => {
  const settings = uatTarget()
  const runner = backupRunner(settings)
  const { messages } = await quietly(() => restore(runner, settings, owner))
  assert.ok(messages.length > 0)
  const order = ['stop api', 'pg_dump', 'RENAME TO "shop"', '--rm migrate', 'start api'].map((step) => position(runner, step))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.ok(order.every((index) => index >= 0))
  const migrateCall = runner.calls.find((call) => call.line.includes('--rm migrate'))
  assert.equal(migrateCall.options.env.DEPLOYED_SHA, '1234567abcdef')
})

test('a restore with no readable deployed version is refused before anything changes', async () => {
  const settings = uatTarget()
  const runner = backupRunner(settings, { apiEnv: '' })
  const { result } = await quietly(() => restore(runner, settings, owner))
  assert.match(result.reason.message, /deploy uat first/)
  assert.ok(!runner.calls.some((call) => call.line.includes('stop api')))
})

test('a failed stop aborts the restore before the backup', async () => {
  const settings = uatTarget()
  const runner = backupRunner(settings, { fail: (text) => text.endsWith('stop api') })
  const { result } = await quietly(() => restore(runner, settings, owner))
  assert.ok(result.reason)
  assert.equal(position(runner, 'pg_dump'), -1)
  assert.equal(position(runner, 'RENAME'), -1)
})

test('a failed pre-restore backup starts the API again and changes nothing', async () => {
  const settings = uatTarget()
  const runner = backupRunner(settings, { failDump: true })
  const { result } = await quietly(() => restore(runner, settings, owner))
  assert.match(result.reason.message, /pg_dump/)
  assert.ok(position(runner, 'start api') > position(runner, 'stop api'))
  assert.equal(position(runner, 'RENAME'), -1)
})

test('a failed migration after the swap leaves the API stopped and says so', async () => {
  const settings = uatTarget()
  const runner = backupRunner(settings, { fail: (text) => text.includes('--rm migrate') })
  const { messages, result } = await quietly(() => restore(runner, settings, owner))
  assert.ok(result.reason)
  assert.equal(position(runner, 'start api'), -1)
  assert.match(messages.join('\n'), /restored, but migrating it failed.*left stopped.*Backup of the replaced data/s)
})

test('a restore that fails before any database was swapped starts the API again', async () => {
  const settings = uatTarget()
  const runner = backupRunner(settings, { fail: (text) => text.includes('pg_restore -U') })
  const { result } = await quietly(() => restore(runner, settings, owner))
  assert.ok(result.reason)
  assert.ok(position(runner, 'start api') > position(runner, 'stop api'))
})

test('a restore that fails after some databases were swapped leaves the API stopped', async () => {
  const dir = temporaryFolder('shop-partial-')
  const values = { ...sampleValues, ConnectionStrings__Shop: 'Database=dev_a', ConnectionStrings__Identity: 'Database=dev_b' }
  const target = settingsFor('dev', { app: twoDatabaseApp, stateDir: dir, values })
  const folderPath = join(dir, 'backups', name)
  mkdirSync(folderPath, { recursive: true })
  const databases = ['app', 'identity'].map((role, index) => {
    const file = `uat_${index}.dump`
    writeFileSync(join(folderPath, file), role)
    return { role, database: `uat_${index}`, file, sizeBytes: Buffer.byteLength(role), sha256: createHash('sha256').update(role).digest('hex') }
  })
  writeManifest(folderPath, createManifest({ environment: 'uat', reason: 'deploy', createdAt: new Date('2026-10-16T09:30:05Z'), databases, migrations: [] }))
  const runner = services((call) => (call.args.some((argument) => argument.includes('pg_restore -U')) && call.args.includes('dev_b_restore_20261029100000') ? { code: 1, stderr: 'corrupt' } : {}))
  const { messages, result } = await quietly(() => restore(runner, target, { backup: name, now: () => when }))
  assert.ok(result.reason)
  assert.ok(position(runner, 'RENAME TO "dev_a"') >= 0)
  assert.equal(position(runner, 'start api'), -1)
  assert.match(messages.join('\n'), /Already restored: dev_a.*left stopped/)
})
