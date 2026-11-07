import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listBackups, migrationId, restorePointFor, schemaOf, unmergedMigrations } from './backups.mjs'
import { appliedMigrations, hasSchema } from './database.mjs'
import { runningContainer } from './environment.mjs'
import { fingerprints, isMigrationFile, migrationIdsOf } from './migration-files.mjs'
import { runChecked } from './process.mjs'

export { fingerprints, isMigrationFile, migrationIdsOf }

export function sourceMigrations(root) {
  const files = []
  const walk = (relative) => {
    const folder = join(root, relative)
    if (!existsSync(folder)) return
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== 'bin' && entry.name !== 'obj') walk(path)
      } else if (isMigrationFile(path)) {
        files.push({ path, text: readFileSync(join(root, path), 'utf8') })
      }
    }
  }
  walk('backend')
  return fingerprints(files)
}

const APPROVAL = /^(\S+\/\d{14}_[A-Za-z0-9_]+) ([0-9a-fA-F]{64}) (\S.*) #(\d+)\s*$/

export function approvedMigrationEdits(text) {
  const entries = new Map()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = APPROVAL.exec(line)
    if (!match) continue
    const id = migrationId(match[1])
    if (!entries.has(id)) entries.set(id, new Set())
    entries.get(id).add(match[2].toLowerCase())
  }
  return entries
}

const isApproved = (approved, id, hash) => approved.get(id)?.has(hash) === true

export function checkMigrations({ applied, source, recorded, approved = new Map(), main = new Map() }) {
  const ids = [...new Set(applied.map(migrationId))].filter((id) => source.has(id))
  const changed = []
  const unrecorded = []
  for (const id of ids) {
    const baseline = recorded[id] ?? main.get(id)
    if (baseline === undefined) unrecorded.push(id)
    else if (baseline !== source.get(id) && !isApproved(approved, id, source.get(id))) changed.push(id)
  }
  return { changed: changed.sort(), missing: unmergedMigrations(applied, new Set(source.keys())), unrecorded: unrecorded.sort() }
}

export function checkAgainstMain({ main, source, approved = new Map(), base = main }) {
  const changed = []
  const missing = []
  for (const id of new Set([...main.keys(), ...base.keys()])) {
    const mine = source.get(id)
    if (mine === base.get(id)) continue
    if (mine === undefined) {
      if (main.has(id)) missing.push(id)
    }
    else if (mine !== main.get(id) && !isApproved(approved, id, mine)) changed.push(id)
  }
  return { changed: changed.sort(), missing: missing.sort() }
}

export function recordApplied({ applied, source, recorded }) {
  const next = { ...recorded }
  for (const entry of applied) {
    const id = migrationId(entry)
    if (source.has(id)) next[id] = source.get(id)
  }
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
}

const fingerprintFile = (stateDir) => join(stateDir, 'uat-migrations.json')

export function readFingerprints(stateDir) {
  const path = fingerprintFile(stateDir)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

export function writeFingerprints(stateDir, recorded) {
  const path = fingerprintFile(stateDir)
  writeFileSync(`${path}.tmp`, `${JSON.stringify(recorded, null, 2)}\n`)
  renameSync(`${path}.tmp`, path)
}

async function uatSchemas(runner, settings) {
  const db = await runningContainer(runner, settings, 'db')
  const applied = new Set()
  let found = false
  for (const { name } of settings.databases) {
    if (!(await hasSchema(runner, db, name))) continue
    found = true
    for (const migration of await appliedMigrations(runner, db, name)) applied.add(migration)
  }
  return { found, applied: [...applied].sort() }
}

export async function readApprovedEdits(runner, root) {
  const result = await runner('git', ['-C', root, 'show', 'origin/main:approved-migration-edits.txt'])
  if (result.code === 0) return approvedMigrationEdits(result.stdout)
  if (/does not exist in|exists on disk, but not in/.test(result.stderr)) return approvedMigrationEdits('')
  throw new Error(`Reading approved-migration-edits.txt from origin/main failed (${result.stderr.trim()}).`)
}

async function readMigrationsAt(runner, root, ref) {
  const listed = await runChecked(runner, 'git', ['-C', root, 'ls-tree', '-r', '--name-only', ref, '--', 'backend'], { what: `git ls-tree ${ref}` })
  const files = []
  for (const path of listed.stdout.split(/\r?\n/).filter(isMigrationFile)) {
    const text = (await runChecked(runner, 'git', ['-C', root, 'show', `${ref}:${path}`], { what: `git show ${ref}:${path}` })).stdout
    files.push({ path, text })
  }
  return fingerprints(files)
}

export async function fetchMain(runner, root, { strict = false } = {}) {
  const result = await runner('git', ['-C', root, 'fetch', '--quiet', 'origin', 'main'])
  if (result.code === 0) return
  if (strict) throw new Error(`Refusing to deploy uat: git fetch origin main failed (${(result.stderr ?? '').trim()}), so origin/main may be stale and the migrations cannot be judged against it. Nothing was changed.`)
  console.warn(`Warning: git fetch origin main failed (${(result.stderr ?? '').trim()}), so origin/main may be stale.`)
}

export async function readMainMigrations(runner, root) {
  return readMigrationsAt(runner, root, 'origin/main')
}

export async function readMergeBaseMigrations(runner, root) {
  const found = await runner('git', ['-C', root, 'merge-base', 'origin/main', 'HEAD'])
  const base = found.code === 0 ? found.stdout.trim() : ''
  return base ? readMigrationsAt(runner, root, base) : null
}

export function pasteEntries(ids, source, schemas = new Map()) {
  return ids.map((id) => `${schemas.get(id) ?? '<schema>'}/${id} ${source.get(id)}`).join('; ')
}

export async function checkUatMigrations(runner, settings, { source, approved, main = new Map(), adoptUnrecorded = false }) {
  const { found, applied } = await uatSchemas(runner, settings)
  if (!found) return { firstDeploy: true }
  if (applied.length > 0 && source.size === 0) {
    throw new Error('Refusing to deploy uat: uat has applied migrations, but no migration was found under backend/**/Migrations/ (bin and obj skipped). Nothing was changed.')
  }
  const { changed, missing, unrecorded } = checkMigrations({ applied, source, recorded: readFingerprints(settings.stateDir), approved, main })
  if (changed.length > 0) {
    const recordedHashes = readFingerprints(settings.stateDir)
    const schemas = new Map(applied.map((entry) => [migrationId(entry), schemaOf(entry)]))
    const behind = changed.filter((id) => !recordedHashes[id])
    const rebase = behind.length > 0 ? ` ${behind.join(', ')} was compared with origin/main because uat has no recorded hash for it: if this branch is only behind main, rebase it onto main and deploy again.` : ''
    throw new Error(`Refusing to deploy uat: ${changed.join(', ')} changed after uat applied it (CLA-0010). Fix forward with a new migration, or ask the owner to approve the edit by adding '<entry> <what happened>. #<issue>' to approved-migration-edits.txt on main, where <entry> is one of: ${pasteEntries(changed, source, schemas)} (the hash is of this commit's file with LF line endings).${rebase} Nothing was changed.`)
  }
  if (missing.length > 0) {
    const migrated = new Set(missing.map(schemaOf))
    const known = (entry) => source.has(migrationId(entry)) || !migrated.has(schemaOf(entry))
    const point = restorePointFor((await listBackups(settings.backupDir)).complete, missing, known)
    const rollBack = point
      ? `To roll uat back, the owner runs node scripts/restore.mjs --environment uat --backup ${point.name} --owner-approved --no-start --confirm 'restore uat ${point.name}' (taken ${point.manifest.createdAtUtc}; uat data entered after it is lost), then deploys again.`
      : 'No backup without them exists; the owner decides how to roll uat back.'
    throw new Error(`Refusing to deploy uat: uat has applied ${missing.join(', ')}, which this commit lacks (an abandoned or replaced pull request, or a branch behind main). Nothing was changed. ${rollBack}`)
  }
  if (unrecorded.length > 0 && !adoptUnrecorded) {
    throw new Error(`Refusing to deploy uat: uat has applied ${unrecorded.join(', ')}, which has no recorded fingerprint and is not on origin/main, so there is no baseline to compare with (CLA-0010). Ask the owner: if they have checked that this commit's file is the one uat applied, they run the uat deploy with --adopt-unrecorded-migrations to record it. Nothing was changed.`)
  }
  return { firstDeploy: false }
}

export async function recordUatFingerprints(runner, settings, source) {
  if (!(await runningContainer(runner, settings, 'db'))) return
  const { found, applied } = await uatSchemas(runner, settings)
  if (!found) return
  writeFingerprints(settings.stateDir, recordApplied({ applied, source, recorded: readFingerprints(settings.stateDir) }))
}
