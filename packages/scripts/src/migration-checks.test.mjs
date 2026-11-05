import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createManifest, writeManifest } from './backups.mjs'
import { settingsFor } from './environment.mjs'
import { fakeRunner } from './fake-runner.mjs'
import { sampleApp, sampleValues } from '../test/sample-app.mjs'
import {
  approvedMigrationEdits,
  checkMigrations,
  checkUatMigrations,
  fingerprints,
  isMigrationFile,
  migrationIdsOf,
  readApprovedEdits,
  readFingerprints,
  recordApplied,
  recordUatFingerprints,
  sourceMigrations,
  writeFingerprints,
} from './migration-checks.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'migration-checks-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
let folders = 0
const freshDir = () => {
  const dir = join(scratch, String(folders++))
  mkdirSync(dir, { recursive: true })
  return dir
}

test('migration files are the migrations of non-test projects, without designers and snapshots', () => {
  assert.ok(isMigrationFile('backend/App.Persistence/Migrations/20260101000000_Initial.cs'))
  assert.ok(isMigrationFile('backend\\Claudalisk.Scheduling\\Migrations\\InitialScheduling.cs'))
  assert.ok(!isMigrationFile('backend/App.Persistence/Migrations/20260101000000_Initial.Designer.cs'))
  assert.ok(!isMigrationFile('backend/App.Persistence/Migrations/AppDbContextModelSnapshot.cs'))
  assert.ok(!isMigrationFile('backend/App.Tests/Migrations/20260101000000_TestOnly.cs'))
  assert.ok(isMigrationFile('backend/Modules/Orders/Orders.Persistence/Migrations/20260101000000_Initial.cs'))
  assert.ok(isMigrationFile('backend/Modules/Orders/Orders.Persistence/Migrations/Sub/20260101000000_Initial.cs'))
  assert.ok(!isMigrationFile('backend/Modules/Orders.Tests/Orders.Persistence/Migrations/20260101000000_Initial.cs'))
  assert.ok(!isMigrationFile('backend/Modules/Orders/Orders.Persistence/Migrations/OrdersDbContextModelSnapshot.cs'))
  assert.ok(!isMigrationFile('backend/Modules/Orders/Orders.Persistence/Orders.cs'))
  assert.ok(!isMigrationFile('other/Migrations/20260101000000_Initial.cs'))
})

test('a migration id comes from every [Migration] attribute, or else from the file name', () => {
  assert.deepEqual(migrationIdsOf('x/20260101000000_Initial.cs', 'class Initial {}'), ['20260101000000_Initial'])
  assert.deepEqual(migrationIdsOf('x/InitialScheduling.cs', '[Migration("20260102000000_InitialScheduling")]'), ['20260102000000_InitialScheduling'])
  assert.deepEqual(migrationIdsOf('x/Modules.cs', '[Migration("20260103000000_A")]\n[Migration("20260103000001_B")]'), ['20260103000000_A', '20260103000001_B'])
  assert.deepEqual(migrationIdsOf('x/Helper.cs', 'class Helper {}'), [])
})

test('fingerprints ignore line endings, and the source scan finds every migration of the backend', () => {
  assert.deepEqual(fingerprints([{ path: 'a/20260101000000_A.cs', text: 'one\r\ntwo\n' }]), fingerprints([{ path: 'a/20260101000000_A.cs', text: 'one\ntwo\n' }]))
  const root = freshDir()
  const migrations = join(root, 'backend', 'App.Persistence', 'Migrations')
  mkdirSync(migrations, { recursive: true })
  writeFileSync(join(migrations, '20260101000000_Initial.cs'), 'one')
  writeFileSync(join(migrations, '20260101000000_Initial.Designer.cs'), 'designer')
  writeFileSync(join(migrations, 'InitialLibrary.cs'), '[Migration("20260102000000_InitialLibrary")]')
  mkdirSync(join(root, 'backend', 'App.Tests', 'Migrations'), { recursive: true })
  writeFileSync(join(root, 'backend', 'App.Tests', 'Migrations', '20260103000000_TestOnly.cs'), 'test')
  assert.deepEqual([...sourceMigrations(root).keys()].sort(), ['20260101000000_Initial', '20260102000000_InitialLibrary'])
})

test('the source scan finds migrations at any depth under backend and skips bin and obj', () => {
  const root = freshDir()
  const nested = join(root, 'backend', 'Modules', 'Orders', 'Orders.Persistence', 'Migrations')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, '20260101000000_Initial.cs'), 'one')
  const built = join(root, 'backend', 'Modules', 'Orders', 'Orders.Persistence', 'obj', 'Migrations')
  mkdirSync(built, { recursive: true })
  writeFileSync(join(built, '20260109000000_Generated.cs'), 'generated')
  assert.deepEqual([...sourceMigrations(root).keys()], ['20260101000000_Initial'])
})

test('the approved edits file lists schema/id entries, with or without a reason', () => {
  assert.deepEqual(
    [...approvedMigrationEdits('catalog/20261028131259_InitialCreate moved ... #168\npublic/20261016120952_InitialCreate\nnot an entry\n')],
    ['catalog/20261028131259_InitialCreate', 'public/20261016120952_InitialCreate'],
  )
})

test('an applied migration whose file changed is refused unless approved; one the commit lacks is missing', () => {
  const source = new Map([['20260101000000_A', 'h1'], ['20260102000000_B', 'h2-new']])
  const applied = ['app/20260101000000_A', 'app/20260102000000_B', 'app/20260103000000_Abandoned']
  const recorded = { '20260101000000_A': 'h1', '20260102000000_B': 'h2-old' }

  assert.deepEqual(checkMigrations({ applied, source, recorded }), {
    changed: ['20260102000000_B'],
    missing: ['app/20260103000000_Abandoned'],
    unrecorded: ['20260103000000_Abandoned'],
  })
  assert.deepEqual(checkMigrations({ applied, source, recorded: {} }).unrecorded, ['20260101000000_A', '20260102000000_B', '20260103000000_Abandoned'])
  assert.deepEqual(checkMigrations({ applied, source, recorded, approved: new Set(['app/20260102000000_B']) }).changed, [])
  assert.deepEqual(checkMigrations({ applied: [...applied, 'legacy/20250101000000_Old'], source, recorded }).missing, ['app/20260103000000_Abandoned'], 'a schema the commit does not migrate at all is not missing')
  assert.deepEqual(checkMigrations({ applied, source, recorded: {} }).changed, [], 'a migration seen for the first time is recorded, not refused')
  assert.deepEqual(recordApplied({ applied, source, recorded }), { '20260101000000_A': 'h1', '20260102000000_B': 'h2-new' })
})

test('fingerprints are written whole, beside uat.env', () => {
  const stateDir = freshDir()
  assert.deepEqual(readFingerprints(stateDir), {})
  writeFingerprints(stateDir, { '20260101000000_A': 'h1' })
  assert.deepEqual(JSON.parse(readFileSync(join(stateDir, 'uat-migrations.json'), 'utf8')), { '20260101000000_A': 'h1' })
  assert.ok(!existsSync(join(stateDir, 'uat-migrations.json.tmp')))
})

function uatWith({ applied, hasSchema = true, backups = [], recorded }) {
  const stateDir = freshDir()
  for (const [name, createdAt, migrations] of backups) {
    const folder = join(stateDir, 'backups', name)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'shop.dump'), 'dump')
    writeManifest(folder, createManifest({
      environment: 'uat', reason: 'deploy', createdAt: new Date(createdAt),
      databases: [{ role: 'app', database: 'shop', file: 'shop.dump', sizeBytes: 4, sha256: createHash('sha256').update('dump').digest('hex') }],
      migrations,
    }))
  }
  if (recorded) writeFingerprints(stateDir, recorded)
  const settings = settingsFor('uat', { app: sampleApp, stateDir, values: sampleValues })
  const runner = fakeRunner((call) => {
    if (call.args.includes('ps') && call.args.includes('db')) return { stdout: 'db1\n' }
    const sql = call.options.input ?? ''
    if (sql.includes('SELECT EXISTS')) return { stdout: hasSchema ? 't\n' : 'f\n' }
    if (sql.includes('gexec')) return { stdout: applied.join('\n') }
    return {}
  })
  return { settings, runner, stateDir }
}

const source = new Map([['20260101000000_A', 'h1']])

test('a first deploy has nothing to check', async () => {
  const { settings, runner } = uatWith({ applied: [], hasSchema: false })
  assert.deepEqual(await checkUatMigrations(runner, settings, { source, approved: new Set() }), { firstDeploy: true })
})

test('a changed applied migration is refused before anything is written', async () => {
  const { settings, runner } = uatWith({ applied: ['app/20260101000000_A'], recorded: { '20260101000000_A': 'h0' } })
  await assert.rejects(checkUatMigrations(runner, settings, { source, approved: new Set() }), /20260101000000_A changed after uat applied it \(CLA-0010\)\. Fix forward/)
  assert.ok(runner.calls.every((call) => !call.line.includes('pg_dump') && !call.line.includes('pg_restore')))
})

test('migrations the commit lacks are refused with the owner\'s restore command for a backup holding only known migrations', async () => {
  const { settings, runner } = uatWith({
    applied: ['app/20260101000000_A', 'app/20260104000000_X'],
    backups: [
      ['20261001T000000Z-aaaaaaa', '2026-10-01T00:00:00Z', ['app/20260101000000_A']],
      ['20261002T000000Z-bbbbbbb', '2026-10-02T00:00:00Z', ['app/20260101000000_A', 'app/20260103000000_Y']],
      ['20261003T000000Z-ccccccc', '2026-10-03T00:00:00Z', ['app/20260101000000_A', 'app/20260104000000_X']],
    ],
  })
  await assert.rejects(checkUatMigrations(runner, settings, { source, approved: new Set() }), (error) => {
    assert.match(error.message, /uat has applied app\/20260104000000_X, which this commit lacks .*Nothing was changed\./)
    assert.match(error.message, /restore\.mjs --environment uat --backup 20261001T000000Z-aaaaaaa --owner-approved --confirm 'restore uat 20261001T000000Z-aaaaaaa'/, 'the newer backup still holds the abandoned Y, so it is skipped')
    return true
  })
  assert.ok(runner.calls.every((call) => !call.line.includes('pg_dump') && !call.line.includes('pg_restore')))
})

test('migrations the commit lacks with no backup before them leave the decision to the owner', async () => {
  const { settings, runner } = uatWith({ applied: ['app/20260101000000_A', 'app/20260104000000_X'] })
  await assert.rejects(checkUatMigrations(runner, settings, { source, approved: new Set() }), /No backup without them exists; the owner decides/)
})

test('matching migrations pass, and recording keeps the fingerprints of what uat has applied', async () => {
  const { settings, runner, stateDir } = uatWith({ applied: ['app/20260101000000_A'], recorded: { '20260101000000_A': 'h1' } })
  assert.deepEqual(await checkUatMigrations(runner, settings, { source, approved: new Set() }), { firstDeploy: false })
  await recordUatFingerprints(runner, settings, new Map([['20260101000000_A', 'h1'], ['20260102000000_B', 'h2']]))
  assert.deepEqual(readFingerprints(stateDir), { '20260101000000_A': 'h1' }, 'only applied migrations are recorded')
})

function gitRunner(respond) {
  return fakeRunner((call) => (call.command === 'git' ? respond(call) : {}))
}

test('approved edits are read from origin/main, never from the working tree', async () => {
  const root = join(scratch, 'approvals')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'approved-migration-edits.txt'), 'app/20260101000000_Branch why\n')
  const runner = gitRunner(() => ({ stdout: 'app/20260101000000_A why\n' }))
  assert.deepEqual([...(await readApprovedEdits(runner, root))], ['app/20260101000000_A'])
  assert.deepEqual(runner.calls[0].args, ['-C', root, 'show', 'origin/main:approved-migration-edits.txt'])
})

test('a file missing on origin/main approves nothing, and any other git failure throws', async () => {
  const missing = gitRunner(() => ({ code: 128, stderr: "fatal: path 'approved-migration-edits.txt' does not exist in 'origin/main'" }))
  assert.equal((await readApprovedEdits(missing, '/repo')).size, 0)
  const onDisk = gitRunner(() => ({ code: 128, stderr: "fatal: path 'approved-migration-edits.txt' exists on disk, but not in 'origin/main'" }))
  assert.equal((await readApprovedEdits(onDisk, '/repo')).size, 0)
  const broken = gitRunner(() => ({ code: 128, stderr: "fatal: invalid object name 'origin/main'." }))
  await assert.rejects(readApprovedEdits(broken, '/repo'), /invalid object name/)
})

test('uat with applied migrations and no source migrations is refused, naming where it looked', async () => {
  const { settings, runner } = uatWith({ applied: ['app/20260101000000_A'] })
  await assert.rejects(checkUatMigrations(runner, settings, { source: new Map(), approved: new Set() }), /backend\/\*\*\/Migrations.*Nothing was changed\./)
})

test('applied migrations with no recorded fingerprint are listed in one warning and do not refuse', async () => {
  const { settings, runner } = uatWith({ applied: ['app/20260101000000_A'] })
  const warnings = []
  const warn = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    assert.deepEqual(await checkUatMigrations(runner, settings, { source, approved: new Set() }), { firstDeploy: false })
  } finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /20260101000000_A/)
})

test('several databases are checked together, and a first deploy needs none of them to have a schema', async () => {
  const values = { ...sampleValues, ConnectionStrings__Shop: 'Database=a', ConnectionStrings__Identity: 'Database=b' }
  const app = { ...sampleApp, databases: [{ role: 'app', envVar: 'ConnectionStrings__Shop' }, { role: 'identity', envVar: 'ConnectionStrings__Identity' }] }
  const settings = settingsFor('uat', { app, stateDir: freshDir(), values })
  const make = (schemas) => fakeRunner((call) => {
    if (call.args.includes('ps') && call.args.includes('db')) return { stdout: 'db1\n' }
    const sql = call.options.input ?? ''
    const database = call.args.at(-1)
    if (sql.includes('SELECT EXISTS')) return { stdout: schemas[database] ? 't\n' : 'f\n' }
    if (sql.includes('gexec')) return { stdout: schemas[database].join('\n') }
    return {}
  })
  assert.deepEqual(await checkUatMigrations(make({}), settings, { source, approved: new Set() }), { firstDeploy: true })
  const runner = make({ a: ['app/20260101000000_A'], b: ['identity/20260101000000_A'] })
  assert.deepEqual(await checkUatMigrations(runner, settings, { source, approved: new Set() }), { firstDeploy: false })
})
