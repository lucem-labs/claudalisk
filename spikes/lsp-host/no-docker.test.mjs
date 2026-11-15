import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withoutDocker } from './lib/no-docker.mjs'

function frontend() {
  const root = mkdtempSync(join(tmpdir(), 'lsp-host-schema-'))
  mkdirSync(join(root, 'src', 'shared', 'api'), { recursive: true })
  return root
}

test('where there is no Docker, the schema step copies the fixture and runs nothing', async () => {
  const root = frontend()
  const calls = []
  try {
    await withoutDocker(async (...call) => calls.push(call), 'win32')('npm', ['run', 'api:types'], root)
    assert.deepEqual(calls, [])
    assert.ok(existsSync(join(root, 'src', 'shared', 'api', 'schema.d.ts')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('on Linux the schema step runs as usual, and other steps always do', async () => {
  const calls = []
  const run = async (...call) => calls.push(call)
  await withoutDocker(run, 'linux')('npm', ['run', 'api:types'], 'x')
  await withoutDocker(run, 'win32')('npm', ['ci'], 'y')
  assert.deepEqual(calls, [['npm', ['run', 'api:types'], 'x'], ['npm', ['ci'], 'y']])
})
