import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { assertRestoreAllowed, backupName, createManifest, listBackups, readBackup, sha256File, writeManifest } from './backups.mjs'
import { appliedMigrations, dumpDatabase, restoreDatabase } from './database.mjs'
import { compose, composeChecked, deployedVersion, runningContainer } from './environment.mjs'
import { waitForHealth } from './http.mjs'

export function timestamp(date) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}

export async function takeBackup(runner, settings, { reason = 'manual', now = () => new Date() } = {}) {
  const container = await runningContainer(runner, settings, 'db')
  if (!container) throw new Error(`The ${settings.environment} database is not running; deploy ${settings.environment} first.`)
  const deployed = await deployedVersion(runner, settings)
  const createdAt = now()
  const name = backupName(createdAt, deployed?.sha)
  const folder = join(settings.backupDir, name)
  if (existsSync(folder)) throw new Error(`Backup folder ${folder} already exists; wait a second and retry.`)
  mkdirSync(folder, { recursive: true })
  console.log(`Backing up ${settings.environment} into ${folder}`)
  try {
    const databases = []
    const migrations = new Set()
    for (const { role, name: database } of settings.databases) {
      const file = `${database}.dump`
      const entries = await dumpDatabase(runner, { container, database, containerPath: `/backups/${name}/${file}` })
      for (const migration of await appliedMigrations(runner, container, database)) migrations.add(migration)
      const dumpPath = join(folder, file)
      const dump = { role, database, file, sizeBytes: statSync(dumpPath).size, sha256: await sha256File(dumpPath) }
      databases.push(dump)
      console.log(`  ${database}: ${entries} entries, ${Math.round(dump.sizeBytes / 1024)} KB, sha256 ${dump.sha256.slice(0, 12)}...`)
    }
    writeManifest(folder, createManifest({
      environment: settings.environment,
      reason,
      createdAt,
      deployedSha: deployed?.sha,
      deployedRef: deployed?.ref,
      databases,
      migrations,
    }))
  } catch (error) {
    rmSync(folder, { recursive: true, force: true })
    throw error
  }
  console.log(`Backup complete: ${name}`)
  return folder
}

export async function migrate(runner, settings, deployed) {
  console.log(`Applying pending migrations to the ${settings.environment} database.`)
  await composeChecked(runner, settings, ['--profile', 'migrate', 'run', '--rm', 'migrate'], {
    inherit: true,
    env: { DEPLOYED_SHA: deployed.sha, DEPLOYED_REF: deployed.ref },
    what: `Applying migrations to ${settings.environment}`,
  })
}

export async function selectBackup(directory, backup) {
  if (backup === 'latest') {
    const { complete } = await listBackups(directory)
    if (complete.length === 0) throw new Error(`No complete backups found in ${directory}.`)
    return readBackup(complete[0].path, { verify: true })
  }
  return readBackup(join(directory, backup), { verify: true })
}

export async function restore(runner, target, { backup, confirm, ownerApproved = false, noStart = false, now = () => new Date() }) {
  assertRestoreAllowed({ environment: target.environment, backup, confirm, ownerApproved })
  const selected = await selectBackup(target.backupDir, backup)
  console.log(`Backup ${selected.name} (taken ${selected.manifest.createdAtUtc}, deployed ${selected.manifest.deployedSha ?? 'unknown'}) verified.`)
  const container = await runningContainer(runner, target, 'db')
  if (!container) throw new Error(`The ${target.environment} database is not running; deploy ${target.environment} first.`)

  let deployed = null
  if (!noStart) {
    deployed = await deployedVersion(runner, target)
    if (!deployed) throw new Error(`The deployed version of ${target.environment} cannot be read, so a restore could not migrate the database afterwards; deploy ${target.environment} first. Nothing was changed.`)
  }

  console.log(`Stopping the ${target.environment} API.`)
  await composeChecked(runner, target, ['stop', 'api'], { what: `Stopping the ${target.environment} API` })

  let preRestoreNote = ''
  if (target.environment === 'uat') {
    console.log("Taking a backup of uat's current data first.")
    try {
      preRestoreNote = ` Backup of the replaced data: ${await takeBackup(runner, target, { reason: 'pre-restore', now })}`
    } catch (error) {
      console.error(`The backup of the current uat data failed, so nothing was changed. Starting the API again.`)
      await compose(runner, target, ['start', 'api'])
      throw error
    }
  }

  const restored = []
  try {
    for (const dump of selected.dumps) {
      const into = target.databases.find((database) => database.role === dump.role)
      if (!into) throw new Error(`The backup holds a '${dump.role}' database that ${target.environment} does not have.`)
      await restoreDatabase(runner, { container, database: into.name, dumpPath: dump.dumpPath, stamp: timestamp(now()) })
      restored.push(into.name)
    }
  } catch (error) {
    if (restored.length > 0) {
      console.error(`Restore failed. Already restored: ${restored.join(', ')}. The others are unchanged. The API is left stopped.${preRestoreNote}`)
    } else {
      console.error(`Restore failed. The ${target.environment} database is unchanged. Starting the API again.${preRestoreNote}`)
      await compose(runner, target, ['start', 'api'])
    }
    throw error
  }

  if (noStart) {
    console.log(`Restored ${target.environment} from backup ${selected.name}; the API is left stopped (--no-start).${preRestoreNote}`)
    return selected
  }
  try {
    await migrate(runner, target, deployed)
  } catch (error) {
    console.error(`The backup ${selected.name} is restored, but migrating it failed. The ${target.environment} API is left stopped.${preRestoreNote}`)
    throw error
  }
  await compose(runner, target, ['start', 'api'])
  if (!(await waitForHealth(target))) {
    throw new Error(`The ${target.environment} API did not become healthy after the restore.${preRestoreNote}`)
  }
  console.log(`Restored ${target.environment} from backup ${selected.name}.${preRestoreNote}`)
  return selected
}
