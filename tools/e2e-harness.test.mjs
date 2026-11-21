import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LogLatch } from '../templates/app/frontend/e2e/harness/log-latch.mjs'
import { playwrightArgs, runProjects } from '../templates/app/frontend/e2e/harness/playwright-runs.mjs'
import { createServer } from 'node:net'
import { OS_ASSIGNED, portOf, resolvePorts } from '../templates/app/frontend/e2e/harness/ports.mjs'
import { startUntilLogged } from '../templates/app/frontend/e2e/harness/processes.mjs'
import { startStubs } from '../templates/app/frontend/e2e/harness/stubs.mjs'
import { apiEnvironment, LISTENING } from '../templates/app/frontend/e2e/harness/api.mjs'
import { VITE_LISTENING } from '../templates/app/frontend/e2e/harness/vite.mjs'

function holdPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const SERVER_ON_PORT_ZERO = `
const server = require('node:http').createServer((request, response) => response.end('up'))
server.listen(0, '127.0.0.1', () => console.log('info: Microsoft.Hosting.Lifetime[14]\\n      Now listening on: http://127.0.0.1:' + server.address().port))
`

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

test('a port from the environment wins and every other port is left to the OS', () => {
  assert.equal(OS_ASSIGNED, 0)
  assert.deepEqual(resolvePorts(['A', 'B', 'C'], { B: '4100' }), { A: OS_ASSIGNED, B: 4100, C: OS_ASSIGNED })
})

test('a port that is not a number is refused', () => {
  assert.throws(() => resolvePorts(['A'], { A: 'abc' }), /A must be a port number/)
  assert.throws(() => resolvePorts(['A'], { A: '70000' }), /A must be a port number/)
})

test('the API is told to bind port 0 unless a port is given', () => {
  assert.equal(apiEnvironment({ connectionString: 'c', workers: false }).ASPNETCORE_URLS, 'http://127.0.0.1:0')
  assert.equal(apiEnvironment({ connectionString: 'c', port: 4100, workers: false }).ASPNETCORE_URLS, 'http://127.0.0.1:4100')
})

test('stubs bind a port the OS picks and report it, beside ports already taken', async () => {
  const held = await Promise.all([holdPort(), holdPort()])
  const servers = await Promise.all([startStubs({}), startStubs({})])
  try {
    const ports = servers.map((server) => portOf(server.url))
    const taken = held.map((server) => server.address().port)
    assert.ok(ports.every((port) => port > 0 && !taken.includes(port)))
    assert.notEqual(ports[0], ports[1])
    assert.equal((await fetch(`${servers[0].url}/none`)).status, 502)
  } finally {
    await Promise.all(servers.map((server) => server.stop()))
    await Promise.all(held.map((server) => new Promise((resolve) => server.close(resolve))))
  }
})

test('the API URL comes from its listening line, so the port the OS picked is the one used', async () => {
  const api = await startUntilLogged({ name: 'Fake API', command: process.execPath, args: ['-e', SERVER_ON_PORT_ZERO], ready: LISTENING })
  try {
    assert.match(api.url, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.ok(portOf(api.url) > 0)
    assert.equal(await (await fetch(api.url)).text(), 'up')
  } finally {
    await api.stop()
  }
})

test('the API listening line in a JSON log still yields the URL', () => {
  const latch = new LogLatch(LISTENING)
  latch.write('{"Message":"Now listening on: http://127.0.0.1:41234","Level":"Information"}\n')
  assert.equal(latch.match.groups.url, 'http://127.0.0.1:41234')
})

test('the Vite URL comes from its Local line and not from the ready line', () => {
  const latch = new LogLatch(VITE_LISTENING)
  latch.write('  VITE v8.3.6  ready in 1522 ms\n\n')
  assert.equal(latch.latched, false)
  latch.write('  ➜  \x1b[1mLocal\x1b[0m:   http://127.0.0.1:\x1b[1m52529\x1b[0m/\n')
  assert.equal(latch.latched, true)
  assert.equal(portOf(latch.match.groups.url), 52529)
})

test('the API runs with workers and schedules off unless a test turns them on', () => {
  const off = apiEnvironment({ connectionString: 'c', port: 1, workers: false })
  assert.equal(off.Jobs__WorkersEnabled, 'false')
  assert.equal(off.Scheduling__Enabled, 'false')
  assert.equal(apiEnvironment({ connectionString: 'c', port: 1, workers: true }).Jobs__WorkersEnabled, 'true')
})

test('a stub answers under its name and an unknown stub is a 502', async () => {
  const server = await startStubs({ rates: (_, response, path) => response.end(path) })
  try {
    assert.equal(await (await fetch(`${server.url}/rates/today`)).text(), '/today')
    assert.equal((await fetch(`${server.url}/other/x`)).status, 502)
  } finally {
    await server.stop()
  }
})
