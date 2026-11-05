import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export function backupName(createdAt, sha) {
  const short = /^[0-9a-fA-F]{7}/.test(sha ?? '') ? sha.slice(0, 7).toLowerCase() : 'unknown'
  const stamp = createdAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${stamp}-${short}`
}

export function isBackupName(name) {
  return /^\d{8}T\d{6}Z-([0-9a-f]{7}|unknown)$/.test(name)
}

export function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')))
  })
}

export function createManifest({ environment, reason, createdAt, deployedSha, deployedRef, databases, migrations }) {
  return {
    environment,
    reason,
    createdAtUtc: createdAt.toISOString(),
    deployedSha: deployedSha ?? null,
    deployedRef: deployedRef ?? null,
    databases: databases.map(({ role, database, file, sizeBytes, sha256 }) => ({ role, database, file, sizeBytes, sha256 })),
    migrations: [...migrations].sort(),
  }
}

export function writeManifest(folder, manifest) {
  writeFileSync(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

export function parseManifest(text, folder) {
  let manifest
  try {
    manifest = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new Error(`Backup '${folder}': manifest.json is not valid JSON.`)
  }
  for (const field of ['createdAtUtc', 'reason']) {
    if (!manifest[field]) throw new Error(`Backup '${folder}': manifest.json has no '${field}'.`)
  }
  if (!Array.isArray(manifest.databases) || manifest.databases.length === 0) {
    throw new Error(`Backup '${folder}': manifest.json lists no databases.`)
  }
  for (const database of manifest.databases) {
    for (const field of ['role', 'database', 'file', 'sizeBytes', 'sha256']) {
      if (!database[field] && database[field] !== 0) throw new Error(`Backup '${folder}': a database in manifest.json has no '${field}'.`)
    }
    if (/[\\/]/.test(database.file)) throw new Error(`Backup '${folder}': manifest.json names a file outside the backup folder.`)
  }
  return manifest
}

export async function readBackup(folder, { verify = false } = {}) {
  const manifestPath = join(folder, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error(`Backup '${folder}' has no manifest.json; it is incomplete.`)
  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'), folder)
  const dumps = manifest.databases.map((database) => ({ role: database.role, database: database.database, dumpPath: join(folder, database.file) }))
  if (verify) {
    for (const [index, database] of manifest.databases.entries()) {
      const dumpPath = dumps[index].dumpPath
      if (!existsSync(dumpPath)) throw new Error(`Backup '${folder}' is missing ${database.file}.`)
      const size = statSync(dumpPath).size
      if (size !== database.sizeBytes) throw new Error(`Backup '${folder}': ${database.file} has ${size} bytes, the manifest says ${database.sizeBytes}.`)
      const actual = await sha256File(dumpPath)
      if (actual !== database.sha256) {
        throw new Error(`Backup '${folder}': ${database.file} does not match its SHA-256 (expected ${database.sha256}, got ${actual}).`)
      }
    }
  }
  return { name: basename(folder), path: folder, createdAt: new Date(manifest.createdAtUtc), dumps, manifest }
}

export async function listBackups(directory) {
  const complete = []
  const incomplete = []
  if (existsSync(directory)) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folder = join(directory, entry.name)
      try {
        complete.push(await readBackup(folder))
      } catch {
        incomplete.push(folder)
      }
    }
  }
  complete.sort((a, b) => b.createdAt - a.createdAt)
  return { complete, incomplete }
}

export function migrationId(entry) {
  return entry.includes('/') ? entry.slice(entry.indexOf('/') + 1) : entry
}

export function schemaOf(entry) {
  return entry.includes('/') ? entry.slice(0, entry.indexOf('/')) : ''
}

export function unmergedMigrations(applied, ids) {
  const migrated = new Set([...applied].filter((entry) => ids.has(migrationId(entry))).map(schemaOf))
  return [...applied].filter((entry) => !ids.has(migrationId(entry)) && migrated.has(schemaOf(entry))).sort()
}

export function restorePointFor(newestFirst, migrations, known = () => true) {
  return newestFirst.find(
    (backup) =>
      Array.isArray(backup.manifest.migrations)
      && !migrations.some((migration) => backup.manifest.migrations.includes(migration))
      && backup.manifest.migrations.every(known),
  ) ?? null
}

export function selectBackupsToKeep(backups, keep, unmerged = []) {
  const newestFirst = [...backups].sort((a, b) => b.createdAt - a.createdAt)
  const kept = new Set(newestFirst.slice(0, keep).map((backup) => backup.name))
  const protectedFor = {}
  for (const migration of unmerged) {
    const restorePoint = restorePointFor(newestFirst, [migration])
    if (restorePoint) {
      kept.add(restorePoint.name)
      protectedFor[migration] = restorePoint.name
    }
  }
  return { keep: kept, protectedFor }
}

export function assertRestoreAllowed({ environment, backup, confirm, ownerApproved }) {
  if (backup !== 'latest' && !isBackupName(backup ?? '')) {
    throw new Error(`--backup takes a backup folder name like 20261016T093000Z-3e38675 (or 'latest' for dev), not '${backup ?? ''}'.`)
  }
  if (environment !== 'uat') return
  if (backup === 'latest') throw new Error("Refusing to restore uat: name the backup explicitly; 'latest' is only for dev.")
  if (!ownerApproved) {
    throw new Error('Refusing to restore uat: only the owner restores uat (--owner-approved). It loses uat data entered after the backup.')
  }
  if (confirm !== `restore uat ${backup}`) throw new Error(`Refusing to restore uat: pass --confirm 'restore uat ${backup}'.`)
}
