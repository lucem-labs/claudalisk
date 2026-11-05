import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { callApi, waitForHealth } from './http.mjs'

function serve(handler) {
  return new Promise((resolvePromise) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

const close = (server) => new Promise((resolvePromise) => server.close(resolvePromise))

test('the API is called on the loopback with the environment host name', async () => {
  const seen = []
  const server = await serve((request, response) => {
    seen.push({ host: request.headers.host, method: request.method, url: request.url })
    response.setHeader('Content-Type', 'application/json')
    response.end('{"status":"ok"}')
  })
  try {
    const port = String(server.address().port)
    const result = await callApi({ proxyPort: port, hostName: 'shop.dev.localhost' }, 'GET', '/api/health')
    assert.deepEqual(seen, [{ host: `shop.dev.localhost:${port}`, method: 'GET', url: '/api/health' }])
    assert.equal(result.status, 200)
    assert.deepEqual(result.json, { status: 'ok' })
  } finally {
    await close(server)
  }
})

test('a body is sent as JSON and a non-JSON answer has no json', async () => {
  let body = ''
  let type
  const server = await serve((request, response) => {
    type = request.headers['content-type']
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => response.end('plain'))
  })
  try {
    const result = await callApi({ proxyPort: String(server.address().port), hostName: 'h' }, 'POST', '/x', { a: 1 })
    assert.equal(body, '{"a":1}')
    assert.equal(type, 'application/json')
    assert.equal(result.text, 'plain')
    assert.equal(result.json, null)
  } finally {
    await close(server)
  }
})

test('a request that takes too long fails with its method and path', async () => {
  const server = await serve(() => {})
  try {
    await assert.rejects(callApi({ proxyPort: String(server.address().port), hostName: 'h' }, 'GET', '/slow', undefined, { timeoutMs: 50 }), /GET \/slow timed out after 50 ms/)
  } finally {
    server.closeAllConnections()
    await close(server)
  }
})

test('health waits until the API answers 200', async () => {
  const answers = [new Error('refused'), { status: 503 }, { status: 200, json: { ok: true } }]
  const call = async () => {
    const answer = answers.shift()
    if (answer instanceof Error) throw answer
    return answer
  }
  const result = await waitForHealth({}, { attempts: 5, delayMs: 1, call })
  assert.deepEqual(result, { ok: true })
  assert.equal(answers.length, 0)
})

test('health gives up after its attempts', async () => {
  let calls = 0
  const result = await waitForHealth({}, { attempts: 3, delayMs: 1, call: async () => { calls += 1; return { status: 503 } } })
  assert.equal(result, null)
  assert.equal(calls, 3)
})
