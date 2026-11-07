import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { assertHandRun, parseOptions, runMain } from './cli.mjs'
import { fakeRunner } from './fake-runner.mjs'
import { run, runChecked } from './process.mjs'

test('hand-run commands refuse CI', () => {
  assert.throws(() => assertHandRun('x.mjs', 'changes things', { CI: 'true' }), /x\.mjs changes things and is run by hand only, never in CI\./)
  assert.throws(() => assertHandRun('x.mjs', 'changes things', { GITHUB_ACTIONS: 'true' }), /never in CI/)
  assert.doesNotThrow(() => assertHandRun('x.mjs', 'changes things', {}))
})

test('options are strict', () => {
  assert.deepEqual({ ...parseOptions({ a: { type: 'string' } }, ['--a', 'b']) }, { a: 'b' })
  assert.throws(() => parseOptions({ a: { type: 'string' } }, ['--unknown']))
  assert.throws(() => parseOptions({ a: { type: 'string' } }, ['positional']))
})

test('runMain gives the command the app root, its arguments, the environment and the runner', async () => {
  const runner = fakeRunner()
  let received
  const code = await runMain(async (context) => { received = context }, { argv: ['node', join('/app', 'scripts', 'x.mjs'), '--a'], env: { K: 'v' }, runner })
  assert.equal(code, 0)
  assert.deepEqual(received, { appRoot: resolve('/app'), argv: ['--a'], env: { K: 'v' }, runner })
})

test('runMain prints a failure and exits 1', async () => {
  const messages = []
  const original = console.error
  console.error = (message) => messages.push(message)
  const exits = []
  try {
    const code = await runMain(async () => { throw new Error('nope') }, { argv: ['node', '/app/scripts/x.mjs'], exit: (value) => exits.push(value) })
    assert.equal(code, 1)
  } finally {
    console.error = original
  }
  assert.deepEqual(messages, ['nope'])
  assert.deepEqual(exits, [1])
})

test('runMain exits with the number a command returns and the exit code of an error', async () => {
  const exits = []
  const original = console.error
  console.error = () => {}
  try {
    assert.equal(await runMain(async () => 3, { argv: ['node', '/app/scripts/x.mjs'], exit: (value) => exits.push(value) }), 3)
    assert.equal(await runMain(async () => 0, { argv: ['node', '/app/scripts/x.mjs'], exit: (value) => exits.push(value) }), 0)
    const usage = Object.assign(new Error('usage'), { exitCode: 2 })
    assert.equal(await runMain(async () => { throw usage }, { argv: ['node', '/app/scripts/x.mjs'], exit: (value) => exits.push(value) }), 2)
  } finally {
    console.error = original
  }
  assert.deepEqual(exits, [3, 2])
})

test('run captures output and the exit code', async () => {
  const result = await run(process.execPath, ['-e', 'console.log("out"); console.error("err"); process.exit(3)'])
  assert.deepEqual([result.code, result.stdout.trim(), result.stderr.trim()], [3, 'out', 'err'])
})

test('run passes stdin and extra environment', async () => {
  const result = await run(process.execPath, ['-e', 'process.stdin.pipe(process.stdout); process.stdin.on("end", () => process.stdout.write(process.env.EXTRA))'], { input: 'in:', env: { EXTRA: 'x' } })
  assert.equal(result.stdout, 'in:x')
})

test('runChecked names what failed and shows the error output', async () => {
  const runner = fakeRunner(() => ({ code: 2, stderr: 'bad' }))
  await assert.rejects(runChecked(runner, 'docker', ['ps'], { what: 'Listing' }), /Listing failed with exit code 2: bad/)
  await assert.rejects(runChecked(runner, 'docker', ['ps']), /docker ps failed with exit code 2/)
  assert.equal((await runChecked(fakeRunner(), 'docker', ['ps'])).code, 0)
})
