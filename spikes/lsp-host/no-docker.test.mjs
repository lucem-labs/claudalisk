import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { containerRuntimeAnswers, withoutDocker } from './lib/no-docker.mjs'

function frontend() {
  const root = mkdtempSync(join(tmpdir(), 'lsp-host-schema-'))
  mkdirSync(join(root, 'src', 'shared', 'api'), { recursive: true })
  return root
}

test('where no container runtime answers, the schema step copies the fixture, logs it and runs nothing', async () => {
  const root = frontend()
  const calls = []
  const logged = []
  try {
    await withoutDocker(async (...call) => calls.push(call), () => false, (line) => logged.push(line))('npm', ['run', 'api:types'], root)
    assert.deepEqual(calls, [])
    assert.ok(existsSync(join(root, 'src', 'shared', 'api', 'schema.d.ts')))
    assert.equal(logged.length, 1)
    assert.match(logged[0], /committed schema/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('where a container runtime answers, the schema step runs as usual on any platform, and other steps always do', async () => {
  const calls = []
  const run = async (...call) => calls.push(call)
  const wrapped = withoutDocker(run, () => true, () => assert.fail('nothing is substituted'))
  await wrapped('npm', ['run', 'api:types'], 'x')
  await withoutDocker(run, () => false, () => {})('npm', ['ci'], 'y')
  assert.deepEqual(calls, [['npm', ['run', 'api:types'], 'x'], ['npm', ['ci'], 'y']])
})

test('the runtime is asked once, and only a Linux answer counts', async () => {
  let asked = 0
  const wrapped = withoutDocker(async () => {}, () => (asked++, true), () => {})
  await wrapped('npm', ['run', 'api:types'], 'x')
  await wrapped('npm', ['run', 'api:types'], 'x')
  assert.equal(asked, 1)
  const answer = (status, stdout) => () => ({ status, stdout })
  assert.equal(containerRuntimeAnswers(answer(0, 'linux\n')), true)
  assert.equal(containerRuntimeAnswers(answer(0, 'windows\n')), false)
  assert.equal(containerRuntimeAnswers(answer(1, '')), false)
  assert.equal(containerRuntimeAnswers(() => { throw new Error('no docker') }), false)
})
