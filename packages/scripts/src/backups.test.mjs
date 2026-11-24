import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  assertRestoreAllowed,
  backupName,
  createManifest,
  isBackupName,
  parseManifest,
  listBackups,
  migrationsToProtect,
  readBackup,
  restorePointFor,
  selectBackupsToKeep,
  unmergedMigrations,
  writeManifest,
} from './backups.mjs'

const root = mkdtempSync(join(tmpdir(), 'shop-backups-'))
after(() => rmSync(root, { recursive: true, force: true }))

function makeBackup(directory, name, { createdAt, content = 'dump', migrations = [], manifest = {} } = {}) {
  const folder = join(directory, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'shop.dump'), content)
  writeManifest(folder, {
    ...createManifest({
      environment: 'uat',
      reason: 'manual',
      createdAt,
      deployedSha: 'abc1234',
      deployedRef: 'main',
      databases: [{
        role: 'app',
        database: 'shop',
        file: 'shop.dump',
        sizeBytes: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex'),
      }],
      migrations,
    }),
    ...manifest,
  })
  return folder
}

function backup(name, createdAt, migrations) {
  return { name, createdAt: new Date(createdAt), manifest: migrations === undefined ? {} : { migrations } }
}

test('backup names carry the UTC time and the short commit', () => {
  const name = backupName(new Date('2026-10-16T09:30:05.123Z'), '3E38675ABCDEF')
  assert.equal(name, '20261016T093005Z-3e38675')
  assert.equal(backupName(new Date('2026-10-16T09:30:05Z'), null), '20261016T093005Z-unknown')
  assert.ok(isBackupName(name))
  assert.ok(!isBackupName('../20261016T093005Z-3e38675'))
  assert.ok(!isBackupName('latest'))
})

test('the manifest lists the applied migrations in order', () => {
  const manifest = createManifest({
    environment: 'uat', reason: 'deploy', createdAt: new Date('2026-10-16T09:30:05Z'), databases: [{ role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: 'x' }], migrations: ['orders/2', 'billing/1'],
  })
  assert.deepEqual(manifest.migrations, ['billing/1', 'orders/2'])
  assert.equal(manifest.deployedSha, null)
})

test('the manifest records the reason and every database', () => {
  const databases = [
    { role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: 'x', extra: 'dropped' },
    { role: 'identity', database: 'shop_identity', file: 'shop_identity.dump', sizeBytes: 5, sha256: 'y' },
  ]
  const manifest = createManifest({ environment: 'uat', reason: 'pre-restore', createdAt: new Date('2026-10-16T09:30:05Z'), databases, migrations: [] })
  assert.equal(manifest.reason, 'pre-restore')
  assert.deepEqual(manifest.databases.map((item) => item.role), ['app', 'identity'])
  assert.equal(manifest.databases[0].extra, undefined)
})

test('a manifest without a reason or a database is rejected', () => {
  const valid = { createdAtUtc: '2026-10-16T09:30:05.000Z', reason: 'manual', databases: [{ role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: 'x' }] }
  assert.doesNotThrow(() => parseManifest(JSON.stringify(valid), 'f'))
  assert.throws(() => parseManifest(JSON.stringify({ ...valid, reason: undefined }), 'f'), /no 'reason'/)
  assert.throws(() => parseManifest(JSON.stringify({ ...valid, databases: [] }), 'f'), /lists no databases/)
  assert.throws(() => parseManifest(JSON.stringify({ ...valid, databases: [{ role: 'app' }] }), 'f'), /no 'database'/)
  assert.throws(() => parseManifest('{', 'f'), /not valid JSON/)
})

test('a manifest written with a byte order mark is read', () => {
  const text = JSON.stringify({ createdAtUtc: '2026-10-16T09:30:05.000Z', reason: 'manual', databases: [{ role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: 'x' }] })
  assert.equal(parseManifest('\uFEFF' + text, 'f').reason, 'manual')
})

test('a verified backup matches its size and SHA-256', async () => {
  const folder = makeBackup(root, '20261016T093005Z-abc1234', { createdAt: new Date('2026-10-16T09:30:05Z') })
  const read = await readBackup(folder, { verify: true })
  assert.equal(read.name, '20261016T093005Z-abc1234')
  assert.equal(read.manifest.databases[0].database, 'shop')
  assert.deepEqual(read.dumps, [{ role: 'app', database: 'shop', dumpPath: join(folder, 'shop.dump') }])
})

test('verification refuses a changed dump', async () => {
  const folder = makeBackup(root, '20261016T093006Z-abc1234', { createdAt: new Date('2026-10-16T09:30:06Z') })
  writeFileSync(join(folder, 'shop.dump'), 'dumq')
  await assert.rejects(readBackup(folder, { verify: true }), /does not match its SHA-256/)
  writeFileSync(join(folder, 'shop.dump'), 'longer dump')
  await assert.rejects(readBackup(folder, { verify: true }), /has 11 bytes, the manifest says 4/)
})

test('a manifest cannot point outside its folder', async () => {
  const folder = makeBackup(root, '20261016T093007Z-abc1234', { createdAt: new Date('2026-10-16T09:30:07Z'), manifest: { databases: [{ role: 'app', database: 'shop', file: '../other.dump', sizeBytes: 4, sha256: 'x' }] } })
  await assert.rejects(readBackup(folder), /outside the backup folder/)
})

test('backups list newest first, and a folder without a manifest is incomplete', async () => {
  const directory = join(root, 'list')
  makeBackup(directory, '20261001T000000Z-aaaaaaa', { createdAt: new Date('2026-10-01T00:00:00Z') })
  makeBackup(directory, '20261003T000000Z-ccccccc', { createdAt: new Date('2026-10-03T00:00:00Z') })
  makeBackup(directory, '20261002T000000Z-bbbbbbb', { createdAt: new Date('2026-10-02T00:00:00Z') })
  mkdirSync(join(directory, '20261004T000000Z-ddddddd'))
  const { complete, incomplete } = await listBackups(directory)
  assert.deepEqual(complete.map((item) => item.name), ['20261003T000000Z-ccccccc', '20261002T000000Z-bbbbbbb', '20261001T000000Z-aaaaaaa'])
  assert.deepEqual(incomplete, [join(directory, '20261004T000000Z-ddddddd')])
  assert.deepEqual(await listBackups(join(root, 'missing')), { complete: [], incomplete: [] })
})

test('a schema none of whose migrations main has is not migrated by main, so its history is not unmerged', () => {
  assert.deepEqual(unmergedMigrations(['orders/20261020120000_A', 'legacy/20261001000000_Old'], new Set(['20261020120000_A'])), [])
})

test('pruning protects a migration main lacks, also in a schema main does not migrate, but not one a package ships', () => {
  const applied = ['orders/20261020120000_A', 'orders/20261021120000_B', 'billing/20261022000000_N', 'scheduling/20261108000000_InitialScheduling', 'scheduling/20261108000001_AddSchedulingJobs']
  assert.deepEqual(migrationsToProtect(applied, new Set(['20261020120000_A'])), ['billing/20261022000000_N', 'orders/20261021120000_B'])
})

test('a scheduling schema the app migrates from its own source is protected like any other', () => {
  const applied = ['scheduling/20261001000000_Own', 'scheduling/20261002000000_Next']
  assert.deepEqual(migrationsToProtect(applied, new Set(['20261001000000_Own'])), ['scheduling/20261002000000_Next'])
})

const retiredScheduler = [
  'scheduling_old/20261026000000_InitialScheduling',
  'scheduling_old/20261124090000_DropOldSchedules',
  'scheduling/20261026000000_InitialScheduling',
  'scheduling/20261108000001_AddSchedulingJobs',
  'scheduling/20261108000002_RenameLastFiredAt',
]
const retiredSchedulerSource = new Set(['20261026000000_InitialScheduling', '20261124090000_DropOldSchedules'])

test('an id the scheduling schema shares with another schema does not make the package migrations unmerged', () => {
  assert.deepEqual(unmergedMigrations(retiredScheduler, retiredSchedulerSource), [])
  assert.deepEqual(migrationsToProtect(retiredScheduler, retiredSchedulerSource), [])
})

test('a migration the other schema of a shared id lacks is still unmerged and protected', () => {
  const applied = [...retiredScheduler, 'scheduling_old/20261125000000_Abandoned']
  assert.deepEqual(unmergedMigrations(applied, retiredSchedulerSource), ['scheduling_old/20261125000000_Abandoned'])
  assert.deepEqual(migrationsToProtect(applied, retiredSchedulerSource), ['scheduling_old/20261125000000_Abandoned'])
})

test('a scheduling schema the app migrates from its own source is checked even when another schema shares one of its ids', () => {
  const applied = ['scheduling/20261001000000_Own', 'scheduling/20261002000000_Shared', 'scheduling/20261003000000_Next', 'orders/20261002000000_Shared']
  const source = new Set(['20261001000000_Own', '20261002000000_Shared'])
  assert.deepEqual(unmergedMigrations(applied, source), ['scheduling/20261003000000_Next'])
  assert.deepEqual(migrationsToProtect(applied, source), ['scheduling/20261003000000_Next'])
})

test('unmerged migrations are the ones uat has and main does not', () => {
  const unmerged = unmergedMigrations(['orders/20261020120000_A', 'orders/20261021120000_B', 'public/20261001000000_Old'], new Set(['20261020120000_A', '20261001000000_Old']))
  assert.deepEqual(unmerged, ['orders/20261021120000_B'])
})

test('pruning keeps the current and the previous backup', () => {
  const backups = [backup('a', '2026-10-01'), backup('b', '2026-10-02'), backup('c', '2026-10-03')]
  assert.deepEqual([...selectBackupsToKeep(backups).keep].sort(), ['b', 'c'])
  assert.deepEqual([...selectBackupsToKeep(backups.slice(0, 1)).keep], ['a'])
})

test('pruning also keeps the newest backup taken before each unmerged migration', () => {
  const backups = [
    backup('old', '2026-10-01', ['orders/A']),
    backup('before', '2026-10-02', ['orders/A']),
    backup('after-1', '2026-10-03', ['orders/A', 'orders/B']),
    backup('after-2', '2026-10-04', ['orders/A', 'orders/B']),
    backup('after-3', '2026-10-05', ['orders/A', 'orders/B']),
  ]
  const selection = selectBackupsToKeep(backups, ['orders/B'])
  assert.deepEqual([...selection.keep].sort(), ['after-2', 'after-3', 'before'])
  assert.deepEqual(selection.protectedFor, { 'orders/B': 'before' })
})

test('a restore point holds none of the missing migrations and only migrations the commit knows', () => {
  const newestFirst = [backup('after-b', '2026-10-03', ['orders/A', 'orders/Y']), backup('before', '2026-10-02', ['orders/A']), backup('old', '2026-10-01', [])]
  assert.equal(restorePointFor(newestFirst, ['orders/B']).name, 'after-b')
  assert.equal(restorePointFor(newestFirst, ['orders/B'], (entry) => entry === 'orders/A').name, 'before', 'a backup that holds another abandoned migration is skipped')
  assert.equal(restorePointFor(newestFirst, ['orders/A']).name, 'old')
})

test('a backup without a migration list is never taken as a restore point', () => {
  const selection = selectBackupsToKeep([backup('legacy', '2026-10-01'), backup('new-1', '2026-10-02', ['orders/B']), backup('new-2', '2026-10-03', ['orders/B'])], ['orders/B'])
  assert.deepEqual([...selection.keep].sort(), ['new-1', 'new-2'])
  assert.deepEqual(selection.protectedFor, {})
})

test('only the owner restores uat, by name and with the exact confirmation', () => {
  const name = '20261016T093005Z-3e38675'
  assert.doesNotThrow(() => assertRestoreAllowed({ environment: 'dev', backup: 'latest' }))
  assert.doesNotThrow(() => assertRestoreAllowed({ environment: 'dev', backup: name }))
  assert.throws(() => assertRestoreAllowed({ environment: 'dev', backup: 'C:\\somewhere\\else' }), /folder name/)
  assert.throws(() => assertRestoreAllowed({ environment: 'uat', backup: 'latest', ownerApproved: true, confirm: 'restore uat latest' }), /explicitly/)
  assert.throws(() => assertRestoreAllowed({ environment: 'uat', backup: name, confirm: `restore uat ${name}` }), /only the owner/)
  assert.throws(() => assertRestoreAllowed({ environment: 'uat', backup: name, ownerApproved: true, confirm: 'restore uat something-else' }), /--confirm/)
  assert.doesNotThrow(() => assertRestoreAllowed({ environment: 'uat', backup: name, ownerApproved: true, confirm: `restore uat ${name}` }))
})
