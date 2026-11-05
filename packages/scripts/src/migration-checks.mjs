import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listBackups, migrationId, restorePointFor, schemaOf, unmergedMigrations } from './backups.mjs'
import { appliedMigrations, hasSchema } from './database.mjs'
import { runningContainer } from './environment.mjs'

export function isMigrationFile(path) {
  const segments = path.replace(/\\/g, '/').split('/')
  const file = segments.at(-1)
  return segments[0] === 'backend'
    && segments.slice(1, -1).includes('Migrations')
    && file.endsWith('.cs')
    && !segments.some((segment) => segment.endsWith('.Tests'))
    && !file.endsWith('.Designer.cs')
    && !file.endsWith('ModelSnapshot.cs')
}

export function migrationIdsOf(path, text) {
  const declared = [...text.matchAll(/\[Migration\("(\d{14}_[A-Za-z0-9_]+)"\)\]/g)].map((match) => match[1])
  if (declared.length > 0) return declared
  const named = /(\d{14}_[A-Za-z0-9_]+)\.cs$/.exec(path.replace(/\\/g, '/'))?.[1]
  return named ? [named] : []
}

export function fingerprints(files) {
  const migrations = new Map()
  for (const { path, text } of files) {
    const normal = text.replace(/\r\n/g, '\n')
    const hash = createHash('sha256').update(normal).digest('hex')
    for (const id of migrationIdsOf(path, normal)) migrations.set(id, hash)
  }
  return migrations
}

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

export function approvedMigrationEdits(text) {
  const entries = new Set()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = /^(\S+\/\d{14}_[A-Za-z0-9_]+)(?:\s|$)/.exec(line)
    if (match) entries.add(match[1])
  }
  return entries
}

export function checkMigrations({ applied, source, recorded, approved = new Set() }) {
  const approvedIds = new Set([...approved].map(migrationId))
  const changed = applied
    .map(migrationId)
    .filter((id) => source.has(id) && recorded[id] && recorded[id] !== source.get(id) && !approvedIds.has(id))
  const unrecorded = applied.map(migrationId).filter((id) => !recorded[id]).sort()
  return { changed: changed.sort(), missing: unmergedMigrations(applied, new Set(source.keys())), unrecorded }
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

export async function checkUatMigrations(runner, settings, { source, approved }) {
  const { found, applied } = await uatSchemas(runner, settings)
  if (!found) return { firstDeploy: true }
  if (applied.length > 0 && source.size === 0) {
    throw new Error('Refusing to deploy uat: uat has applied migrations, but no migration was found under backend/**/Migrations/ (bin and obj skipped). Nothing was changed.')
  }
  const { changed, missing, unrecorded } = checkMigrations({ applied, source, recorded: readFingerprints(settings.stateDir), approved })
  if (unrecorded.length > 0) {
    console.warn(`Warning: uat has applied ${unrecorded.join(', ')} with no recorded fingerprint, so an edit made before the first recording cannot be detected.`)
  }
  if (changed.length > 0) {
    throw new Error(`Refusing to deploy uat: ${changed.join(', ')} changed after uat applied it (CLA-0010). Fix forward with a new migration. Nothing was changed.`)
  }
  if (missing.length > 0) {
    const migrated = new Set(missing.map(schemaOf))
    const known = (entry) => source.has(migrationId(entry)) || !migrated.has(schemaOf(entry))
    const point = restorePointFor((await listBackups(settings.backupDir)).complete, missing, known)
    const rollBack = point
      ? `To roll uat back, the owner runs node scripts/restore.mjs --environment uat --backup ${point.name} --owner-approved --confirm 'restore uat ${point.name}' (taken ${point.manifest.createdAtUtc}; uat data entered after it is lost), then deploys again.`
      : 'No backup without them exists; the owner decides how to roll uat back.'
    throw new Error(`Refusing to deploy uat: uat has applied ${missing.join(', ')}, which this commit lacks (an abandoned or replaced pull request, or a branch behind main). Nothing was changed. ${rollBack}`)
  }
  return { firstDeploy: false }
}

export async function recordUatFingerprints(runner, settings, source) {
  if (!(await runningContainer(runner, settings, 'db'))) return
  const { found, applied } = await uatSchemas(runner, settings)
  if (!found) return
  writeFingerprints(settings.stateDir, recordApplied({ applied, source, recorded: readFingerprints(settings.stateDir) }))
}
