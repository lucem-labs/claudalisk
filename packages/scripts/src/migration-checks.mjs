import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listBackups, migrationId, restorePointFor, schemaOf, unmergedMigrations } from './backups.mjs'
import { appliedMigrations, hasSchema } from './database.mjs'
import { runningContainer } from './environment.mjs'

export function isMigrationFile(path) {
  const match = /^backend\/([^/]+)\/Migrations\/([^/]+\.cs)$/.exec(path.replace(/\\/g, '/'))
  return Boolean(match) && !match[1].endsWith('.Tests') && !match[2].endsWith('.Designer.cs') && !match[2].endsWith('ModelSnapshot.cs')
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
  for (const project of readdirSync(join(root, 'backend'), { withFileTypes: true })) {
    if (!project.isDirectory()) continue
    const folder = join(root, 'backend', project.name, 'Migrations')
    if (!existsSync(folder)) continue
    for (const file of readdirSync(folder)) {
      const path = `backend/${project.name}/Migrations/${file}`
      if (isMigrationFile(path)) files.push({ path, text: readFileSync(join(folder, file), 'utf8') })
    }
  }
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
  return { changed: changed.sort(), missing: unmergedMigrations(applied, new Set(source.keys())) }
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

export function readApprovedEdits(root) {
  const path = join(root, 'approved-migration-edits.txt')
  return approvedMigrationEdits(existsSync(path) ? readFileSync(path, 'utf8') : '')
}

export async function checkUatMigrations(runner, settings, { source, approved }) {
  const { found, applied } = await uatSchemas(runner, settings)
  if (!found) return { firstDeploy: true }
  const { changed, missing } = checkMigrations({ applied, source, recorded: readFingerprints(settings.stateDir), approved })
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
