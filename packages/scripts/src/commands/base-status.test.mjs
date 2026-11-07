import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseStatus, commitsBehindMain, githubClient, openPullHeads, setBaseStatus, statusFor } from './base-status.mjs'

const env = {
  GITHUB_API_URL: 'https://api.example.test',
  GITHUB_TOKEN: 'token',
  GITHUB_REPOSITORY: 'acme/shop',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_SERVER_URL: 'https://github.example.test',
  GITHUB_RUN_ID: '77',
}
const runUrl = 'https://github.example.test/acme/shop/actions/runs/77'

function fakeApi(routes) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://api.example.test', '')
    calls.push({ method: init.method, path, body: init.body === undefined ? undefined : JSON.parse(init.body), headers: init.headers })
    const route = routes.find(([method, pattern]) => method === init.method && pattern.test(path))
    const reply = route ? route[2] : { status: 404, body: { message: 'Not Found' } }
    const { status, body } = typeof reply === 'function' ? reply(path) : reply
    return { ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) }
  }
  return { fetchImpl, calls }
}

const ok = (body) => ({ status: 200, body })
const created = { status: 201, body: {} }
const run = async (argv, api, overrides = {}) => {
  const lines = []
  const code = await baseStatus({ argv, env: { ...env, ...overrides }, fetchImpl: api.fetchImpl, log: (line) => lines.push(line) })
  return { code, lines }
}

test('the status says success when the commit is not behind main', () => {
  assert.deepEqual(statusFor(0, runUrl), { state: 'success', context: 'up to date with main', description: 'Up to date with main', target_url: runUrl })
})

test('the status says how many commits behind when it is', () => {
  assert.equal(statusFor(3, runUrl).state, 'failure')
  assert.equal(statusFor(3, runUrl).description, '3 commits behind main')
  assert.equal(statusFor(1, runUrl).description, '1 commit behind main')
})

test('the compare step reads behind_by without writing anything', async () => {
  const api = fakeApi([['GET', /^\/repos\/acme\/shop\/compare\/main\.\.\.b+\?per_page=1$/, ok({ behind_by: 4, ahead_by: 2 })]])
  assert.equal(await commitsBehindMain(githubClient(env, api.fetchImpl), 'acme/shop', 'b'.repeat(40)), 4)
  assert.deepEqual(api.calls.map((call) => call.method), ['GET'])
})

test('the compare step refuses an answer without behind_by', async () => {
  const api = fakeApi([['GET', /compare/, ok({})]])
  await assert.rejects(commitsBehindMain(githubClient(env, api.fetchImpl), 'acme/shop', 'x'), /no behind_by/)
})

test('the write step posts the status to the commit', async () => {
  const api = fakeApi([['POST', /^\/repos\/acme\/shop\/statuses\/abc$/, created]])
  await setBaseStatus(githubClient(env, api.fetchImpl), 'acme/shop', 'abc', 2, runUrl)
  assert.deepEqual(api.calls[0].body, statusFor(2, runUrl))
})

test('requests carry the token and the API version', async () => {
  const api = fakeApi([['GET', /compare/, ok({ behind_by: 0 })]])
  await commitsBehindMain(githubClient(env, api.fetchImpl), 'acme/shop', 'abc')
  assert.equal(api.calls[0].headers.Authorization, 'Bearer token')
  assert.equal(api.calls[0].headers['X-GitHub-Api-Version'], '2022-11-28')
})

test('a branch that is up to date gets a success status and exit code 0', async () => {
  const api = fakeApi([['GET', /compare/, ok({ behind_by: 0 })], ['POST', /statuses/, created]])
  const { code, lines } = await run([], api)
  assert.equal(code, 0)
  assert.deepEqual(api.calls.map((call) => `${call.method} ${call.path}`), [`GET /repos/acme/shop/compare/main...${env.GITHUB_SHA}?per_page=1`, `POST /repos/acme/shop/statuses/${env.GITHUB_SHA}`])
  assert.deepEqual(api.calls[1].body, statusFor(0, runUrl))
  assert.match(lines[0], /up to date with main/)
})

test('a branch that is behind gets a failure status and exit code 1', async () => {
  const api = fakeApi([['GET', /compare/, ok({ behind_by: 5 })], ['POST', /statuses/, created]])
  const { code, lines } = await run([], api)
  assert.equal(code, 1)
  assert.equal(api.calls[1].body.state, 'failure')
  assert.equal(api.calls[1].body.description, '5 commits behind main')
  assert.match(lines[0], /5 commits behind main/)
})

test('an API error fails the command', async () => {
  const api = fakeApi([['GET', /compare/, { status: 500, body: { message: 'boom' } }]])
  await assert.rejects(run([], api), /HTTP 500/)
})

test('a missing variable is named', async () => {
  const api = fakeApi([])
  await assert.rejects(run([], api, { GITHUB_TOKEN: '' }), /GITHUB_TOKEN is not set/)
  await assert.rejects(run([], api, { GITHUB_SHA: '' }), /GITHUB_SHA is not set/)
  assert.equal(api.calls.length, 0)
})

test('an unknown argument is refused', async () => {
  await assert.rejects(run(['--nope'], fakeApi([])), /Unknown option/)
})

test('open pull requests are listed page by page', async () => {
  const page = (from, count) => Array.from({ length: count }, (_, i) => ({ number: from + i, head: { sha: `sha${from + i}` } }))
  const api = fakeApi([['GET', /pulls/, (path) => ok(path.endsWith('&page=1') ? page(1, 100) : page(101, 2))]])
  const heads = await openPullHeads(githubClient(env, api.fetchImpl), 'acme/shop')
  assert.equal(heads.length, 102)
  assert.deepEqual(heads[101], { number: 102, sha: 'sha102' })
  assert.match(api.calls[0].path, /state=open&base=main&per_page=100&page=1$/)
})

test('--open-pulls sets the status on every open pull request and exits 0 even when some are behind', async () => {
  const behind = { sha1: 0, sha2: 3 }
  const api = fakeApi([
    ['GET', /pulls/, ok([{ number: 1, head: { sha: 'sha1' } }, { number: 2, head: { sha: 'sha2' } }])],
    ['GET', /compare\/main\.\.\.(sha\d)/, (path) => ok({ behind_by: behind[/\.\.\.(sha\d)/.exec(path)[1]] })],
    ['POST', /statuses/, created],
  ])
  const { code } = await run(['--open-pulls'], api)
  assert.equal(code, 0)
  const posts = api.calls.filter((call) => call.method === 'POST')
  assert.deepEqual(posts.map((call) => [call.path, call.body.state]), [['/repos/acme/shop/statuses/sha1', 'success'], ['/repos/acme/shop/statuses/sha2', 'failure']])
  assert.equal(posts[1].body.target_url, runUrl)
})

test('--open-pulls reports every pull request it could not set and fails', async () => {
  const api = fakeApi([
    ['GET', /pulls/, ok([{ number: 1, head: { sha: 'sha1' } }, { number: 2, head: { sha: 'sha2' } }])],
    ['GET', /compare\/main\.\.\.sha1/, { status: 500, body: {} }],
    ['GET', /compare\/main\.\.\.sha2/, ok({ behind_by: 0 })],
    ['POST', /statuses/, created],
  ])
  await assert.rejects(run(['--open-pulls'], api), /1 of 2 open pull requests.*#1:.*HTTP 500/s)
  assert.equal(api.calls.filter((call) => call.method === 'POST').length, 1)
})

test('--open-pulls with no open pull requests does nothing', async () => {
  const api = fakeApi([['GET', /pulls/, ok([])]])
  const { code } = await run(['--open-pulls'], api)
  assert.equal(code, 0)
  assert.equal(api.calls.length, 1)
})

test('--open-pulls fails when the pull request list cannot be read', async () => {
  await assert.rejects(run(['--open-pulls'], fakeApi([['GET', /pulls/, { status: 403, body: {} }]])), /HTTP 403/)
})
