import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { test } from 'node:test'
import { envLines, freePorts } from './ports.mjs'

test('free ports are distinct and can be bound again', async () => {
  const ports = await freePorts(2)
  assert.equal(new Set(ports).size, 2)
  for (const port of ports) {
    const server = createServer()
    await new Promise((resolvePromise, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolvePromise))
    await new Promise((resolvePromise) => server.close(resolvePromise))
  }
})

test('ports are written as environment lines', () => {
  assert.equal(envLines(['E2E_API_PORT', 'E2E_WEB_PORT'], [5001, 5002]), 'E2E_API_PORT=5001\nE2E_WEB_PORT=5002\n')
})
