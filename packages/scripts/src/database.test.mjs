import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appliedMigrations, hasSchema, quoteIdentifier, quoteLiteral, restoreDatabase, swapSql } from './database.mjs'
import { fakeRunner } from './fake-runner.mjs'

const restore = { container: 'db1', database: 'shop', dumpPath: '/backups/x/shop.dump', stamp: '20261028090000' }

function sqlOf(call) {
  return call.options.input ?? ''
}

test('identifiers and literals are quoted', () => {
  assert.equal(quoteIdentifier('a"b'), '"a""b"')
  assert.equal(quoteLiteral("it's"), "'it''s'")
})

test('psql gets its SQL on stdin, never in the arguments', async () => {
  const runner = fakeRunner(() => ({ stdout: 't\n' }))
  assert.equal(await hasSchema(runner, 'db1', 'shop'), true)
  const [call] = runner.calls
  assert.deepEqual(call.args.slice(0, 3), ['exec', '-i', 'db1'])
  assert.ok(!call.args.some((argument) => argument.includes('SELECT')))
  assert.match(sqlOf(call), /__EFMigrationsHistory/)
})

test('applied migrations are read from every schema and sorted', async () => {
  const runner = fakeRunner(() => ({ stdout: 'scheduling/2\norders/1\n\n' }))
  assert.deepEqual(await appliedMigrations(runner, 'db1', 'shop'), ['orders/1', 'scheduling/2'])
  assert.match(sqlOf(runner.calls[0]), /\\gexec/)
})

test('a restore fills a temporary database and swaps it in by rename', async () => {
  const runner = fakeRunner()
  await restoreDatabase(runner, restore)
  const lines = runner.calls.map((call) => `${call.line} ${sqlOf(call)}`)
  const order = ['docker cp', 'CREATE DATABASE "shop_restore_20261028090000"', 'pg_restore', 'RENAME TO "shop_replaced_20261028090000"', 'DROP DATABASE "shop_replaced_20261028090000"', 'rm -f']
  let position = -1
  for (const step of order) {
    const found = lines.findIndex((line, index) => index > position && line.includes(step))
    assert.ok(found > position, `${step} runs after the previous step`)
    position = found
  }
  const pgRestore = runner.calls.find((call) => call.args.includes('sh') && call.args.some((argument) => argument.includes('pg_restore')))
  assert.deepEqual(pgRestore.args.slice(-2), ['shop_restore_20261028090000', '/tmp/shop_restore_20261028090000.dump'])
})

test('a failed restore leaves the database unchanged and drops the temporary one', async () => {
  const runner = fakeRunner((call) => (call.args.some((argument) => argument.includes('pg_restore -U')) ? { code: 1, stderr: 'corrupt' } : {}))
  await assert.rejects(restoreDatabase(runner, restore), /shop is unchanged/)
  const sql = runner.calls.map(sqlOf).join('\n')
  assert.doesNotMatch(sql, /RENAME/)
  assert.match(sql, /DROP DATABASE IF EXISTS "shop_restore_20261028090000"/)
  assert.ok(runner.calls.some((call) => call.line.endsWith('rm -f /tmp/shop_restore_20261028090000.dump')))
})

test('the swap ends other sessions, then renames both databases', () => {
  const sql = swapSql('shop', 'shop_restore_1', 'shop_replaced_1')
  assert.match(sql, /pg_terminate_backend.*datname = 'shop'/)
  assert.match(sql, /BEGIN;\nALTER DATABASE "shop" RENAME TO "shop_replaced_1";\nALTER DATABASE "shop_restore_1" RENAME TO "shop";\nCOMMIT;/)
  assert.ok(sql.indexOf('pg_terminate_backend') < sql.indexOf('BEGIN;'))
})

test('a failed swap drops the temporary database and does not drop the original', async () => {
  const runner = fakeRunner((call) => (sqlOf(call).includes('RENAME TO') ? { code: 1, stderr: 'rename failed' } : {}))
  await assert.rejects(restoreDatabase(runner, restore))
  const sql = runner.calls.map(sqlOf).join('\n')
  assert.match(sql, /DROP DATABASE IF EXISTS "shop_restore_20261028090000"/)
  assert.doesNotMatch(sql, /DROP DATABASE "shop_replaced/)
})

test('a failed drop of the replaced database after a good swap warns and still succeeds', async () => {
  const runner = fakeRunner((call) => (sqlOf(call).startsWith('DROP DATABASE "shop_replaced') ? { code: 1, stderr: 'in use' } : {}))
  const warnings = []
  const warn = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    await restoreDatabase(runner, restore)
  } finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /shop_replaced_20261028090000/)
  assert.ok(!runner.calls.map(sqlOf).join('\n').includes('DROP DATABASE IF EXISTS "shop_restore'))
})
