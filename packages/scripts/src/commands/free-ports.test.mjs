import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportFreePorts } from './free-ports.mjs'

const fixedPorts = async (count) => Array.from({ length: count }, (_, i) => 5001 + i)

test('the ports are appended to the GITHUB_ENV file as NAME=port lines', async () => {
  const writes = []
  const code = await exportFreePorts({ argv: ['E2E_API_PORT', 'E2E_WEB_PORT'], env: { GITHUB_ENV: '/tmp/env' }, ports: fixedPorts, append: (file, text) => writes.push([file, text]), log: () => assert.fail('nothing is printed') })
  assert.equal(code, 0)
  assert.deepEqual(writes, [['/tmp/env', 'E2E_API_PORT=5001\nE2E_WEB_PORT=5002\n']])
})

test('without GITHUB_ENV the lines are printed', async () => {
  const printed = []
  await exportFreePorts({ argv: ['A_PORT'], env: {}, ports: fixedPorts, append: () => assert.fail('no file'), log: (text) => printed.push(text) })
  assert.deepEqual(printed, ['A_PORT=5001'])
})

test('an invalid or repeated name is refused before any port is taken', async () => {
  const ports = () => assert.fail('no port is taken')
  for (const name of ['1PORT', 'A-B', 'A=B', '--x', '', 'A B']) {
    await assert.rejects(exportFreePorts({ argv: ['OK_PORT', name], env: {}, ports }), /not a valid environment variable name/, name)
  }
  await assert.rejects(exportFreePorts({ argv: ['A', 'A'], env: {}, ports }), /once/)
  await assert.rejects(exportFreePorts({ argv: [], env: {}, ports }), /Usage/)
})

test('real free ports are distinct numbers', async () => {
  const printed = []
  await exportFreePorts({ argv: ['A_PORT', 'B_PORT'], env: {}, log: (text) => printed.push(text) })
  const [a, b] = printed[0].split('\n').map((line) => Number(line.split('=')[1]))
  assert.ok(a > 0 && b > 0 && a !== b)
})
