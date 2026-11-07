import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeRunner } from '../fake-runner.mjs'
import { checkForbiddenFiles, forbiddenReason } from './check-forbidden-files.mjs'

test('env files other than examples are forbidden', () => {
  for (const path of ['.env', '.env.local', '.env.dev', 'dev.env', 'uat.env', 'frontend/.env.production', 'deploy/prod.env']) {
    assert.match(forbiddenReason(path), /env file/, path)
  }
  for (const path of ['.env.example', '.env.dev.example', 'dev.env.example', 'frontend/.env.uat.example', 'environment.ts', 'src/env.ts', 'envfile.md']) {
    assert.equal(forbiddenReason(path), null, path)
  }
})

test('dumps, backups and files under a backups folder are forbidden', () => {
  for (const path of ['db.dump', 'shop.pgdump', 'x.backup', 'x.bak', 'data.sql.gz', 'backups/readme.txt', 'ops/backups/20261001/manifest.json', 'DB.DUMP']) {
    assert.ok(forbiddenReason(path), path)
  }
  for (const path of ['backup.mjs', 'scripts/prune-backups.mjs', 'schema.sql', 'dumpster.ts', 'backups.md']) {
    assert.equal(forbiddenReason(path), null, path)
  }
})

test('local json files are forbidden', () => {
  assert.match(forbiddenReason('appsettings.local.json'), /local\.json/)
  assert.match(forbiddenReason('backend/Api/appsettings.Development.local.json'), /local\.json/)
  assert.equal(forbiddenReason('appsettings.json'), null)
  assert.equal(forbiddenReason('local.json'), null)
})

function gitWith({ tracked = [], added = [], hasMain = true }) {
  return fakeRunner((call) => {
    const line = call.args.join(' ')
    if (line.startsWith('ls-files')) return { stdout: tracked.map((file) => `${file}\0`).join('') }
    if (line.startsWith('rev-parse')) return { code: hasMain ? 0 : 1 }
    if (line.startsWith('log')) return { stdout: added.map((file) => `${file}\0`).join('') }
    return undefined
  })
}

async function check(options, env = {}) {
  const runner = gitWith(options)
  const out = []
  const err = []
  const code = await checkForbiddenFiles({ appRoot: '/repo', argv: [], env, runner, log: (t) => out.push(t), error: (t) => err.push(t) })
  return { code, out, err, runner }
}

test('a clean repository passes', async () => {
  const result = await check({ tracked: ['a.ts', '.env.dev.example'], added: ['b.cs'] })
  assert.deepEqual([result.code, result.out, result.err], [0, [], []])
})

test('a tracked forbidden file fails and is listed', async () => {
  const result = await check({ tracked: ['a.ts', 'uat.env'] })
  assert.equal(result.code, 1)
  assert.match(result.err[0], /uat\.env: Forbidden file \(CLA-0026\): an env file other than \*\.example, tracked/)
})

test('a forbidden file added by a commit and deleted since still fails', async () => {
  const result = await check({ tracked: ['a.ts'], added: ['old.dump'] })
  assert.equal(result.code, 1)
  assert.match(result.err[0], /old\.dump.*added by a commit of this branch/)
})

test('a file that is tracked and was added is reported once', async () => {
  const result = await check({ tracked: ['x.bak'], added: ['x.bak'] })
  assert.equal(result.err[0].split('\n').length, 2)
})

test('the git commands are plain argument arrays in the app root', async () => {
  const { runner } = await check({ tracked: [], added: [] })
  assert.deepEqual(runner.calls.map((call) => [call.command, call.args, call.options.cwd]), [
    ['git', ['ls-files', '-z'], '/repo'],
    ['git', ['rev-parse', '--verify', '--quiet', 'origin/main'], '/repo'],
    ['git', ['log', '-z', '--diff-filter=A', '--name-only', '--format=', 'origin/main..HEAD'], '/repo'],
  ])
})

test('a missing origin/main is a warning and the tracked files are still checked', async () => {
  const warned = await check({ tracked: ['a.ts'], hasMain: false })
  assert.equal(warned.code, 0)
  assert.match(warned.out[0], /origin\/main is missing/)
  assert.equal(warned.runner.calls.filter((call) => call.args[0] === 'log').length, 0)
  const annotated = await check({ tracked: ['a.ts'], hasMain: false }, { GITHUB_ACTIONS: 'true' })
  assert.match(annotated.out[0], /^::warning::origin\/main is missing/)
  const failing = await check({ tracked: ['x.dump'], hasMain: false })
  assert.equal(failing.code, 1)
})

test('GitHub Actions gets an error annotation per file', async () => {
  const result = await check({ tracked: ['uat.env'], added: ['db.dump'] }, { GITHUB_ACTIONS: 'true' })
  assert.equal(result.out.length, 2)
  assert.match(result.out[0], /^::error file=uat\.env::Forbidden file/)
  assert.match(result.out[1], /^::error file=db\.dump::Forbidden file/)
})

test('an argument is refused', async () => {
  await assert.rejects(checkForbiddenFiles({ appRoot: '/repo', argv: ['--x'], env: {}, runner: gitWith({}) }), /Unknown option/)
})

test('a failing git command fails the check', async () => {
  const runner = fakeRunner((call) => (call.args[0] === 'ls-files' ? { code: 128, stderr: 'not a repository' } : undefined))
  await assert.rejects(checkForbiddenFiles({ appRoot: '/repo', argv: [], env: {}, runner }), /git ls-files failed.*not a repository/)
})
