import { rmSync } from 'node:fs'
import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { listBackups, migrationsToProtect, selectBackupsToKeep } from '../backups.mjs'
import { appliedMigrations } from '../database.mjs'
import { loadEnvironment, runningContainer } from '../environment.mjs'
import { isMigrationFile, migrationIdsOf } from '../migration-checks.mjs'
import { runChecked } from '../process.mjs'

export const defaultKeep = 10

async function uatMigrations(runner, uat, latest) {
  const db = await runningContainer(runner, uat, 'db')
  if (db) {
    const applied = new Set()
    for (const { name } of uat.databases) for (const migration of await appliedMigrations(runner, db, name)) applied.add(migration)
    return [...applied].sort()
  }
  if (latest && Array.isArray(latest.manifest.migrations)) return latest.manifest.migrations
  return []
}

async function mainMigrationIds(runner, root) {
  await runner('git', ['-C', root, 'fetch', '--quiet', 'origin', 'main'])
  const listed = await runChecked(runner, 'git', ['-C', root, 'ls-tree', '-r', '--name-only', 'origin/main', '--', 'backend'], { what: 'git ls-tree origin/main' })
  const ids = new Set()
  for (const path of listed.stdout.split(/\r?\n/).filter(isMigrationFile)) {
    const text = (await runChecked(runner, 'git', ['-C', root, 'show', `origin/main:${path}`], { what: `git show origin/main:${path}` })).stdout
    for (const id of migrationIdsOf(path, text)) ids.add(id)
  }
  return ids
}

export async function pruneBackups({ appRoot, argv, env, runner }) {
  assertHandRun('prune-backups.mjs', 'deletes uat backups', env)
  const options = parseOptions({ keep: { type: 'string' }, apply: { type: 'boolean', default: false } }, argv)
  const app = readApp(appRoot)
  const uat = loadEnvironment('uat', { app, env })
  const keep = Number(options.keep ?? app.backup?.keep ?? defaultKeep)
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`--keep takes a whole number of at least 1, not '${options.keep}'.`)

  const { complete, incomplete } = await listBackups(uat.backupDir)
  const unmerged = migrationsToProtect(await uatMigrations(runner, uat, complete[0]), await mainMigrationIds(runner, appRoot))
  const selection = selectBackupsToKeep(complete, keep, unmerged)
  const remove = complete.filter((backup) => !selection.keep.has(backup.name))

  console.log(`uat backups in ${uat.backupDir}: ${complete.length} complete, keeping ${selection.keep.size}, deleting ${remove.length}.`)
  for (const [migration, name] of Object.entries(selection.protectedFor)) {
    console.log(`  keeping ${name}: the restore point from before ${migration}, which uat has and main does not.`)
  }
  for (const folder of incomplete) console.log(`  incomplete, left alone: ${folder}`)
  for (const backup of remove) {
    if (options.apply) {
      rmSync(backup.path, { recursive: true, force: true })
      console.log(`  deleted ${backup.name}`)
    } else {
      console.log(`  would delete ${backup.name}`)
    }
  }
  if (!options.apply && remove.length > 0) console.log('Dry run: pass --apply to delete. Deleting backups is the owner decision.')
  return { kept: [...selection.keep], removed: remove.map((backup) => backup.name) }
}
