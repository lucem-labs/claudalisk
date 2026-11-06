import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'
import { allowedKeys, configPath, parseAppConfig, readApp, requiredFields } from './app-config.mjs'
import { sampleConfig } from '../test/sample-app.mjs'

const schema = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tools', 'app-config.schema.json'), 'utf8'))
const scratch = mkdtempSync(join(tmpdir(), 'shop-config-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key))
const parse = (config) => parseAppConfig(JSON.stringify(config), 'cfg.json')

test('the required fields match the schema file', () => {
  assert.deepEqual(requiredFields.app, schema.required)
  assert.deepEqual(requiredFields.database, schema.properties.databases.items.required)
  assert.deepEqual(requiredFields.ports, schema.properties.ports.required)
  assert.deepEqual(requiredFields.uat, schema.properties.uat.required)
})

test('the allowed keys match the schema properties at every closed level', () => {
  const sorted = (keys) => [...keys].sort()
  assert.deepEqual(sorted(allowedKeys.app), sorted(Object.keys(schema.properties)))
  assert.deepEqual(sorted(allowedKeys.database), sorted(Object.keys(schema.properties.databases.items.properties)))
  assert.deepEqual(sorted(allowedKeys.ports), sorted(Object.keys(schema.properties.ports.properties)))
  assert.deepEqual(sorted(allowedKeys.uat), sorted(Object.keys(schema.properties.uat.properties)))
  assert.deepEqual(sorted(allowedKeys.backup), sorted(Object.keys(schema.properties.backup.properties)))
  assert.deepEqual(sorted(allowedKeys.review), sorted(Object.keys(schema.properties.review.properties)))
  for (const level of [schema, schema.properties.databases.items, schema.properties.ports, schema.properties.uat, schema.properties.backup, schema.properties.review]) {
    assert.equal(level.additionalProperties, false)
  }
})

test('an unknown key is rejected at each closed level and named', () => {
  assert.throws(() => parse({ ...sampleConfig, hostprefix: 'x' }), /cfg\.json: "hostprefix" is not a known setting/)
  assert.throws(() => parse({ ...sampleConfig, databases: [{ role: 'app', envVar: 'X', extra: 1 }] }), /"databases\[0\]\.extra" is not a known setting/)
  assert.throws(() => parse({ ...sampleConfig, ports: { ...sampleConfig.ports, web: 1 } }), /"ports\.web" is not a known setting/)
  assert.throws(() => parse({ ...sampleConfig, uat: { ...sampleConfig.uat, volum: 'v' } }), /"uat\.volum" is not a known setting/)
  assert.throws(() => parse({ ...sampleConfig, backup: { keep: 2, count: 3 } }), /"backup\.count" is not a known setting/)
  assert.throws(() => parse({ ...sampleConfig, review: { uatdata: [] } }), /"review\.uatdata" is not a known setting/)
})

test('the sample config satisfies the schema it is checked against', () => {
  assert.deepEqual(parse(sampleConfig).name, 'shop')
  for (const key of Object.keys(sampleConfig)) assert.ok(Object.hasOwn(schema.properties, key), key)
})

test('a missing field is named in the error', () => {
  for (const field of requiredFields.app) {
    assert.throws(() => parse(without(sampleConfig, field)), new RegExp(`cfg\\.json: "${field}" is missing`))
  }
  assert.throws(() => parse({ ...sampleConfig, ports: { devDb: 5440 } }), /"ports\.apiLocal" is missing/)
  assert.throws(() => parse({ ...sampleConfig, uat: { composeProject: 'x' } }), /"uat\.volume" is missing/)
  assert.throws(() => parse({ ...sampleConfig, databases: [{ role: 'app' }] }), /"databases\[0\]\.envVar" is missing/)
})

test('wrong types and empty lists are rejected', () => {
  assert.throws(() => parse({ ...sampleConfig, name: '' }), /"name" must be a non-empty string/)
  assert.throws(() => parse({ ...sampleConfig, databases: [] }), /at least one database/)
  assert.throws(() => parse({ ...sampleConfig, ports: { devDb: '5440', apiLocal: 1 } }), /"ports\.devDb" must be a whole number/)
  assert.throws(() => parse({ ...sampleConfig, uat: { composeProject: 1, volume: 'v' } }), /"uat\.composeProject" must be a non-empty string/)
  assert.throws(() => parse({ ...sampleConfig, backup: { keep: 0 } }), /"backup\.keep"/)
  assert.throws(() => parse({ ...sampleConfig, ports: null }), /"ports" must be an object/)
  assert.throws(() => parseAppConfig('{', 'cfg.json'), /cfg\.json is not valid JSON/)
})

test('a config with a byte order mark is read, and the app carries its root', () => {
  const root = join(scratch, 'app')
  mkdirSync(join(root, '.claude'), { recursive: true })
  writeFileSync(configPath(root), `﻿${JSON.stringify(sampleConfig)}`)
  const app = readApp(root)
  assert.equal(app.root, root)
  assert.equal(app.uat.volume, 'shop-uat_postgres-data')
})

test('a missing config file is named', () => {
  assert.throws(() => readApp(join(scratch, 'nowhere')), /claudalisk\.json does not exist/)
})
