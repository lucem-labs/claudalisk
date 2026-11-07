import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { run } from '../process.mjs'
import { checkMigrationsAgainstMain } from './check-migrations.mjs'

const folder = 'backend/Shop/Shop.Persistence/Migrations'
const A = `${folder}/20260101000000_A.cs`
const B = `${folder}/20260102000000_B.cs`
const C = `${folder}/20260103000000_C.cs`

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function commit(root, files, message) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) unlinkSync(join(root, path))
    else write(root, path, text)
  }
  git(root, 'add', '-A')
  git(root, 'commit', '--quiet', '-m', message)
}

async function scenario({ main, branch }, fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'check-migrations-')))
  try {
    git(root, 'init', '--quiet', '--initial-branch=main')
    commit(root, { [A]: 'a', [B]: 'b' }, 'base')
    git(root, 'checkout', '--quiet', '-b', 'feature')
    git(root, 'checkout', '--quiet', 'main')
    commit(root, { '.keep': 'x', ...main }, 'main moves on')
    git(root, 'update-ref', 'refs/remotes/origin/main', 'main')
    git(root, 'checkout', '--quiet', 'feature')
    commit(root, { '.keep2': 'y', ...branch }, 'feature work')
    await fn(() => checkMigrationsAgainstMain({ appRoot: root, argv: [], env: {}, runner: run }))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a branch behind main that lacks migrations main added later passes', () => scenario({ main: { [C]: 'c' }, branch: {} }, async (check) => {
  assert.deepEqual(await check(), { changed: [], missing: [] })
}))

test('a branch behind main passes when main edited a migration the branch never touched', () => scenario({ main: { [A]: 'a edited on main' }, branch: {} }, async (check) => {
  assert.deepEqual(await check(), { changed: [], missing: [] })
}))

test('a real edit on a branch that is also behind main still fails', () => scenario({ main: { [C]: 'c', [B]: 'b edited on main' }, branch: { [A]: 'a edited on the branch' } }, async (check) => {
  await assert.rejects(check(), (error) => {
    assert.match(error.message, /Changed after reaching origin\/main: 20260101000000_A\./)
    assert.doesNotMatch(error.message, /20260102000000_B|20260103000000_C/)
    return true
  })
}))

test('a migration removed on the branch fails even when the branch is behind main', () => scenario({ main: { [C]: 'c' }, branch: { [B]: null } }, async (check) => {
  await assert.rejects(check(), /missing here: 20260102000000_B\./)
}))

test('a branch that caught up with main edit of a migration passes', () => scenario({ main: { [A]: 'a v2' }, branch: { [A]: 'a v2' } }, async (check) => {
  assert.deepEqual(await check(), { changed: [], missing: [] })
}))
