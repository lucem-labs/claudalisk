import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LogLatch } from '../templates/app/frontend/e2e/harness/log-latch.mjs'
import { playwrightArgs, runProjects } from '../templates/app/frontend/e2e/harness/playwright-runs.mjs'
import { freePorts, resolvePorts } from '../templates/app/frontend/e2e/harness/ports.mjs'
import { startStubs } from '../templates/app/frontend/e2e/harness/stubs.mjs'
import { apiEnvironment } from '../templates/app/frontend/e2e/harness/api.mjs'

const LISTENING = /Now listening on:/

test('the latch holds after the listening line has been trimmed from the tail', async () => {
  const latch = new LogLatch(LISTENING, { limit: 5 })
  latch.write('Now listening on: http://127.0.0.1:1\n')
  for (let line = 0; line < 1000; line++) latch.write(`noise ${line}\n`)
  await latch.done
  assert.equal(latch.latched, true)
  assert.doesNotMatch(latch.tail(), LISTENING)
  assert.equal(latch.tail().split('\n').length, 5)
})

test('the latch sees a line split across two chunks', () => {
  const latch = new LogLatch(LISTENING)
  latch.write('Now lis')
  assert.equal(latch.latched, false)
  latch.write('tening on: http://127.0.0.1:1\r\n')
  assert.equal(latch.latched, true)
})

test('the latch sees a coloured line and one that has no newline yet', () => {
  const coloured = new LogLatch(/ready in \d/)
  coloured.write('\x1b[32mready in \x1b[1m12\x1b[0m ms')
  assert.equal(coloured.latched, true)
})

test('the latch does not fire on other lines', () => {
  const latch = new LogLatch(LISTENING)
  latch.write('Starting\nStill starting\n')
  assert.equal(latch.latched, false)
})

test('the latch keeps an endless line from growing without bound', () => {
  const latch = new LogLatch(LISTENING)
  for (let chunk = 0; chunk < 100; chunk++) latch.write('x'.repeat(10000))
  assert.ok(latch.tail().length < 1100000)
})

test('the serial project runs after a failing parallel run, as a separate call', async () => {
  const calls = []
  const code = await runProjects(async (project, args) => {
    calls.push({ project, args })
    return project === 'parallel' ? 1 : 0
  })
  assert.deepEqual(calls.map((call) => call.project), ['parallel', 'serial'])
  assert.deepEqual(calls[1].args.slice(0, 2), ['test', '--project=serial'])
  assert.equal(code, 1)
})

test('a failure in the serial run fails the whole run', async () => {
  assert.equal(await runProjects(async (project) => (project === 'serial' ? 1 : 0)), 1)
  assert.equal(await runProjects(async () => 0), 0)
})

test('only a filtered run or the serial project may find no tests', () => {
  assert.ok(!playwrightArgs('parallel', []).includes('--pass-with-no-tests'))
  assert.ok(playwrightArgs('serial', []).includes('--pass-with-no-tests'))
  assert.ok(playwrightArgs('parallel', ['e2e/one.spec.ts']).includes('--pass-with-no-tests'))
})

test('a port from the environment wins and the others are picked', async () => {
  const ports = await resolvePorts(['A', 'B', 'C'], { B: '4100' }, async (count) => {
    assert.equal(count, 2)
    return [5001, 5002]
  })
  assert.deepEqual(ports, { A: 5001, B: 4100, C: 5002 })
})

test('a port that is not a number is refused', async () => {
  await assert.rejects(resolvePorts(['A'], { A: 'abc' }, async () => []), /A must be a port number/)
})

test('free ports are distinct and can be bound', async () => {
  const ports = await freePorts(3)
  assert.equal(new Set(ports).size, 3)
  const server = await startStubs({}, ports[0])
  await server.stop()
})

test('the API runs with workers and schedules off unless a test turns them on', () => {
  const off = apiEnvironment({ connectionString: 'c', port: 1, workers: false })
  assert.equal(off.Jobs__WorkersEnabled, 'false')
  assert.equal(off.Scheduling__Enabled, 'false')
  assert.equal(apiEnvironment({ connectionString: 'c', port: 1, workers: true }).Jobs__WorkersEnabled, 'true')
})

test('a stub answers under its name and an unknown stub is a 502', async () => {
  const [port] = await freePorts(1)
  const server = await startStubs({ rates: (_, response, path) => response.end(path) }, port)
  try {
    assert.equal(await (await fetch(`${server.url}/rates/today`)).text(), '/today')
    assert.equal((await fetch(`${server.url}/other/x`)).status, 502)
  } finally {
    await server.stop()
  }
})
