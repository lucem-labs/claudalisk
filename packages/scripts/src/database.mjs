import { runChecked } from './process.mjs'

export function quoteIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`
}

export function quoteLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`
}

export async function psql(runner, container, database, sql) {
  const result = await runChecked(
    runner,
    'docker',
    ['exec', '-i', container, 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$1" -AtX -v ON_ERROR_STOP=1', '_', database],
    { input: sql, what: `psql against ${database}` },
  )
  return result.stdout
}

export const hasSchemaSql = "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '__EFMigrationsHistory');\n"

export const appliedMigrationsSql = `SELECT format('SELECT %L || ''/'' || %I FROM %I.%I', t.table_schema, c.column_name, t.table_schema, t.table_name)
FROM information_schema.tables t
JOIN information_schema.columns c
  ON c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name IN ('migration_id', 'MigrationId')
WHERE t.table_name = '__EFMigrationsHistory'
ORDER BY t.table_schema
\\gexec
`

export async function hasSchema(runner, container, database) {
  return (await psql(runner, container, database, hasSchemaSql)).trim() === 't'
}

export async function appliedMigrations(runner, container, database) {
  const output = await psql(runner, container, database, appliedMigrationsSql)
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()
}

export async function dumpDatabase(runner, { container, database, containerPath }) {
  await runChecked(
    runner,
    'docker',
    ['exec', container, 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom --no-owner --file="$2"', '_', database, containerPath],
    { what: `pg_dump of ${database}` },
  )
  const toc = await runChecked(runner, 'docker', ['exec', container, 'pg_restore', '--list', containerPath], { what: `Reading the dump of ${database}` })
  const entries = toc.stdout.split(/\r?\n/).filter((line) => /^\d+;/.test(line)).length
  if (entries <= 0) throw new Error(`The dump of ${database} has no restorable entries.`)
  return entries
}

export function restoreNames(database, stamp) {
  return { temporary: `${database}_restore_${stamp}`, replaced: `${database}_replaced_${stamp}` }
}

export function swapSql(database, temporary, replaced) {
  return `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(database)} AND pid <> pg_backend_pid();
BEGIN;
ALTER DATABASE ${quoteIdentifier(database)} RENAME TO ${quoteIdentifier(replaced)};
ALTER DATABASE ${quoteIdentifier(temporary)} RENAME TO ${quoteIdentifier(database)};
COMMIT;
`
}

export async function restoreDatabase(runner, { container, database, dumpPath, stamp }) {
  const { temporary, replaced } = restoreNames(database, stamp)
  const file = `/tmp/${temporary}.dump`
  await runChecked(runner, 'docker', ['cp', dumpPath, `${container}:${file}`], { what: `Copying ${dumpPath} into the database container` })
  let created = false
  try {
    await psql(runner, container, 'postgres', `CREATE DATABASE ${quoteIdentifier(temporary)};\n`)
    created = true
    const restored = await runner('docker', [
      'exec', container, 'sh', '-c',
      'pg_restore -U "$POSTGRES_USER" -d "$1" --clean --if-exists --no-owner --exit-on-error --single-transaction "$2"',
      '_', temporary, file,
    ])
    if (restored.code !== 0) {
      throw new Error(`pg_restore into a temporary database failed with exit code ${restored.code}; ${database} is unchanged. ${restored.stderr.trim()}`.trim())
    }
    await psql(runner, container, 'postgres', swapSql(database, temporary, replaced))
    created = false
    try {
      await psql(runner, container, 'postgres', `DROP DATABASE ${quoteIdentifier(replaced)} WITH (FORCE);\n`)
    } catch (error) {
      console.warn(`Warning: ${database} was restored, but the replaced database ${replaced} could not be dropped and is left behind (${error.message}).`)
    }
  } finally {
    if (created) await psql(runner, container, 'postgres', `DROP DATABASE IF EXISTS ${quoteIdentifier(temporary)} WITH (FORCE);\n`)
    await runner('docker', ['exec', container, 'rm', '-f', file])
  }
}
