import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'
import { configPath, parseAppConfig, readApp, requiredFields } from './app-config.mjs'
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
