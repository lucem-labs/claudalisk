import { rmSync } from 'node:fs'
import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { listBackups, migrationsToProtect, selectBackupsToKeep } from '../backups.mjs'
import { appliedMigrations } from '../database.mjs'
import { loadEnvironment, runningContainer } from '../environment.mjs'
import { fetchMain, readMainMigrations } from '../migration-checks.mjs'

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

export async function pruneBackups({ appRoot, argv, env, runner }) {
  assertHandRun('prune-backups.mjs', 'deletes uat backups', env)
  const options = parseOptions({ keep: { type: 'string' }, apply: { type: 'boolean', default: false } }, argv)
  const app = readApp(appRoot)
  const uat = loadEnvironment('uat', { app, env })
  const keep = Number(options.keep ?? app.backup?.keep ?? defaultKeep)
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`--keep takes a whole number of at least 1, not '${options.keep}'.`)

  const { complete, incomplete } = await listBackups(uat.backupDir)
  await fetchMain(runner, appRoot)
  const unmerged = migrationsToProtect(await uatMigrations(runner, uat, complete[0]), new Set((await readMainMigrations(runner, appRoot)).keys()))
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
