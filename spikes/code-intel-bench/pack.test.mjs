import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { main as bench } from './bench.mjs'
import { main as check } from './check-tasks.mjs'
import { cloneFixture } from './fixture-repo.mjs'
import { benchRoot } from './lib.mjs'
import { loadPack, packClonePath, preparePackFixture } from './pack.mjs'
import { copyDependencies } from './runner.mjs'
import { taskIds } from './tasks.mjs'

const identity = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...identity } }).trim()

const PACK_ID = `fake-${process.pid}`
const PATCH = 'diff --git a/answer.txt b/answer.txt\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/answer.txt\n@@ -0,0 +1 @@\n+done\n'

let base
let repo
let commit
let packFolder
let armsDir
let ledgerPath
let logFile

function write(file, text) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

function writePack(overrides = {}, fixtureOverrides = {}) {
  write(join(packFolder, 'pack.json'), JSON.stringify({
    id: PACK_ID,
    fixture: {
      repository: '../repo',
      commit,
      prepare: [{ cwd: 'sub', command: [join(base, 'prepare.mjs')] }],
      dependencies: ['sub/deps'],
      ...fixtureOverrides,
    },
    tasks: 'tasks',
    results: 'results',
    ...overrides,
  }))
}

before(() => {
  base = mkdtempSync(join(tmpdir(), 'bench-pack-'))
  repo = join(base, 'repo')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  write(join(repo, 'app.txt'), 'original\n')
  write(join(repo, 'sub', 'keep.txt'), 'x\n')
  write(join(repo, '.gitignore'), 'sub/deps\n')
  git(repo, 'add', '--all')
  git(repo, 'commit', '-q', '-m', 'fixture')
  commit = git(repo, 'rev-parse', 'HEAD')

  write(join(base, 'prepare.mjs'), "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'\nmkdirSync('deps', { recursive: true })\nwriteFileSync('deps/lib.txt', 'dep')\nappendFileSync(process.env.PREPARE_LOG, 'ran\\n')\n")

  packFolder = join(base, 'pack')
  for (const id of ['P1', 'P2', 'P10']) {
    write(join(packFolder, 'tasks', id, 'task.json'), JSON.stringify({
      id,
      title: `Task ${id}`,
      prompt: `Write answer.txt for ${id}`,
      checks: [{ name: 'the answer exists', command: ['node', 'bench-hidden/check.mjs'] }],
    }))
    write(join(packFolder, 'tasks', id, 'hidden', 'bench-hidden', 'check.mjs'), "import { existsSync } from 'node:fs'\nprocess.exit(existsSync('answer.txt') ? 0 : 1)\n")
    write(join(packFolder, 'tasks', id, 'reference', 'solution.patch'), PATCH)
  }
  write(join(packFolder, 'tasks', 'preamble.md'), 'Work here.\n')
  writePack()

  write(join(base, 'plugin', 'hooks.json'), '{}')
  armsDir = join(base, 'arms')
  write(join(armsDir, 'baseline', 'arm.json'), JSON.stringify({ pluginDir: '../../plugin', settings: 'settings.json', models: ['m1', 'm2'] }))
  process.env.CLAUDE_BIN = join(benchRoot, 'test', 'fake-claude.mjs')
})

beforeEach(() => {
  ledgerPath = join(base, `ledger-${Math.random().toString(36).slice(2)}.json`)
  logFile = join(base, 'prepare.log')
  rmSync(logFile, { force: true })
  rmSync(join(packFolder, 'results'), { recursive: true, force: true })
  writePack()
  rmSync(packClonePath(loadPack(packFolder)), { recursive: true, force: true })
  process.env.PREPARE_LOG = logFile
  process.env.FAKE_CLAUDE_LOG = join(base, 'claude.log')
  process.env.FAKE_CLAUDE_SCENARIO = 'success'
  process.env.FAKE_CLAUDE_WRITE = JSON.stringify({ file: 'answer.txt', text: 'done' })
})

after(() => {
  for (const key of ['CLAUDE_BIN', 'PREPARE_LOG', 'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_SCENARIO', 'FAKE_CLAUDE_WRITE']) delete process.env[key]
  rmSync(packClonePath(loadPack(packFolder)), { recursive: true, force: true })
  rmSync(base, { recursive: true, force: true })
})

const prepares = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').length : 0)

test('a pack loads with its paths resolved against its folder', () => {
  const pack = loadPack(packFolder)

  assert.equal(pack.id, PACK_ID)
  assert.equal(pack.tasksFolder, join(packFolder, 'tasks'))
  assert.equal(pack.resultsFolder, join(packFolder, 'results'))
  assert.equal(pack.fixture.repository, repo)
  assert.equal(pack.fixture.commit, commit)
  assert.deepEqual(pack.fixture.dependencies, ['sub/deps'])
})

test('a URL repository is kept as written', () => {
  writePack({}, { repository: 'https://example.com/owner/app.git' })

  assert.equal(loadPack(packFolder).fixture.repository, 'https://example.com/owner/app.git')
})

test('a pack that is missing or malformed is refused with a clear error', () => {
  const empty = join(base, 'empty')
  mkdirSync(empty)
  assert.throws(() => loadPack(empty), /pack\.json is missing/)
  write(join(base, 'broken', 'pack.json'), '{')
  assert.throws(() => loadPack(join(base, 'broken')), /not valid JSON/)

  const refused = (overrides, fixtureOverrides, pattern) => {
    writePack(overrides, fixtureOverrides)
    assert.throws(() => loadPack(packFolder), pattern)
  }
  refused({ id: 'Bad_Id' }, {}, /id must match/)
  refused({ id: '-x' }, {}, /id must match/)
  refused({}, { commit: 'abc123' }, /full 40-character sha/)
  refused({}, { commit: 'main' }, /full 40-character sha/)
  refused({}, { repository: '' }, /repository/)
  refused({}, { prepare: [{ command: [] }] }, /command list/)
  refused({}, { prepare: [{ cwd: '../out', command: ['x'] }] }, /inside the clone/)
  refused({}, { dependencies: ['/abs'] }, /inside the clone/)
  refused({ tasks: 'nope' }, {}, /tasks folder .* is missing/)
})

test('task ids sort by their number and stay stable without one', () => {
  assert.deepEqual(taskIds(join(packFolder, 'tasks')), ['P1', 'P2', 'P10'])
  const plain = join(base, 'plain')
  for (const id of ['Zed', 'Alpha', 'P2']) write(join(plain, id, 'task.json'), '{}')
  assert.deepEqual(taskIds(plain), ['P2', 'Alpha', 'Zed'])
})

test('the prepared clone is made once, reused, and made again when its marker is missing', async () => {
  const pack = loadPack(packFolder)
  const first = await preparePackFixture(pack)
  assert.equal(first.path, packClonePath(pack))
  assert.equal(first.head, commit)
  assert.equal(readFileSync(join(first.path, 'sub', 'deps', 'lib.txt'), 'utf8'), 'dep')
  assert.equal(prepares(), 1)

  await preparePackFixture(pack)
  assert.equal(prepares(), 1)

  rmSync(join(first.path, git(first.path, 'rev-parse', '--git-path', 'claudalisk-bench-prepared')))
  await preparePackFixture(pack)
  assert.equal(prepares(), 2)
})

test('a failing prepare command is reported with its output and is retried next time', async () => {
  write(join(base, 'fail.mjs'), "console.error('boom here')\nprocess.exit(3)\n")
  writePack({}, { prepare: [{ command: [join(base, 'fail.mjs')] }] })
  await assert.rejects(preparePackFixture(loadPack(packFolder)), /exited with 3[\s\S]*boom here/)

  writePack()
  await preparePackFixture(loadPack(packFolder))
  assert.equal(prepares(), 1)
})

test('a run copy is at the commit, has no remote and has the dependency folders', async () => {
  const fixture = await preparePackFixture(loadPack(packFolder))
  const copy = join(base, 'copy')
  await cloneFixture(copy, { fixture })
  copyDependencies(fixture.path, copy, fixture.dependencies)

  assert.equal(git(copy, 'rev-parse', 'HEAD'), commit)
  assert.equal(git(copy, 'remote'), '')
  assert.equal(readFileSync(join(copy, 'sub', 'deps', 'lib.txt'), 'utf8'), 'dep')
  assert.equal(git(copy, 'status', '--porcelain'), '')
})

test('run --pack writes records into the pack per model and a ledger entry with seven keys', async () => {
  await bench(['run', '--arm', 'baseline', '--pack', packFolder, '--tasks', 'P1', '--runs', '1'], { armsDir, ledgerPath, log: () => {} })

  assert.deepEqual(readdirSync(join(packFolder, 'results', 'baseline')).sort(), ['m1', 'm2'])
  const records = readdirSync(join(packFolder, 'results', 'baseline', 'm1')).filter((name) => name.endsWith('.json'))
  assert.equal(records.length, 1)
  assert.match(records[0], /-P1-1.json$/)
  assert.equal(JSON.parse(readFileSync(join(packFolder, 'results', 'baseline', 'm1', records[0]), 'utf8')).accepted, true)
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  assert.equal(ledger.runs.length, 2)
  assert.deepEqual(Object.keys(ledger.runs[0]).sort(), ['arm', 'at', 'costUsd', 'model', 'pack', 'repeat', 'task'])
  assert.deepEqual(ledger.runs.map((entry) => entry.model), ['m1', 'm2'])
  assert.equal(ledger.runs[0].pack, PACK_ID)
  assert.equal(prepares(), 1)
})

test('run --pack --model runs only that model', async () => {
  await bench(['run', '--arm', 'baseline', '--pack', packFolder, '--model', 'm2', '--tasks', 'P1', '--runs', '1'], { armsDir, ledgerPath, log: () => {} })

  assert.deepEqual(readdirSync(join(packFolder, 'results', 'baseline')), ['m2'])
  assert.deepEqual(JSON.parse(readFileSync(ledgerPath, 'utf8')).runs.map((entry) => entry.model), ['m2'])
})

test('a second run --pack continues from the pack results', async () => {
  const options = { armsDir, ledgerPath, log: () => {} }
  await bench(['run', '--arm', 'baseline', '--pack', packFolder, '--tasks', 'P1', '--runs', '1', '--model', 'm1'], options)
  const lines = []
  await bench(['run', '--arm', 'baseline', '--pack', packFolder, '--model', 'm1', '--tasks', 'P1', '--runs', '1', '--dry-run'], { ...options, log: (line) => lines.push(line) })

  assert.match(lines.join('\n'), /P1 repeat 2/)
})

test('--dry-run --pack prints the plan and prepares nothing', async () => {
  const lines = []
  await bench(['run', '--arm', 'baseline', '--pack', packFolder, '--dry-run'], { armsDir, ledgerPath, log: (line) => lines.push(line), exec: async () => assert.fail('no run') })
  const text = lines.join('\n')

  assert.match(text, new RegExp(`Pack ${PACK_ID}`))
  assert.match(text, /on m1/)
  assert.match(text, /on m2/)
  assert.match(text, /9 runs/)
  assert.match(text, /at most \$27\.00/)
  assert.match(text, /P10 repeat 3/)
  assert.match(text, /Ledger:/)
  assert.equal(existsSync(packClonePath(loadPack(packFolder))), false)
  assert.equal(prepares(), 0)
})

test('report --pack reads the pack records of the model and its task list', async () => {
  write(join(packFolder, 'results', 'baseline', 'm1', '20260101T000000Z-P1-1.json'), JSON.stringify({ task: 'P1', repeat: 1, accepted: true, totalCostUsd: 1, turns: 3, subagents: 0, wallMs: 1000, models: {} }))
  const lines = []
  await bench(['report', '--arm', 'baseline', '--model', 'm1', '--pack', packFolder], { armsDir, log: (line) => lines.push(line) })
  const text = lines.join('\n')

  assert.match(text, /\| P1 \| 1 \| 1 \| 100% \|/)
  assert.match(text, /\| P10 \| 0 \|/)
  assert.doesNotMatch(text, /\| T1 \|/)
})

test('check-tasks --pack checks the pack tasks against the prepared clone', async () => {
  const lines = []
  const original = console.log
  console.log = (line) => lines.push(line)
  try {
    await check(['--pack', packFolder, '--tasks', 'P1'])
  } finally {
    console.log = original
  }

  assert.ok(lines.some((line) => /^P1 untouched: FAIL/.test(line)))
  assert.ok(lines.some((line) => /^P1 reference: pass/.test(line)))
})

const has = (cwd, sha) => {
  try {
    execFileSync('git', ['cat-file', '-e', sha], { cwd, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('the prepared clone and a run copy hold nothing newer than the pinned commit', async () => {
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'newer than the pin')
  const newer = git(repo, 'rev-parse', 'HEAD')
  try {
    const fixture = await preparePackFixture(loadPack(packFolder))
    const copy = join(base, 'copy-history')
    await cloneFixture(copy, { fixture })

    assert.equal(has(fixture.path, commit), true)
    assert.equal(has(fixture.path, newer), false)
    assert.equal(has(copy, newer), false)
    assert.equal(git(fixture.path, 'for-each-ref', 'refs/heads'), '')
    assert.equal(git(fixture.path, 'tag', '--list'), '')
    assert.equal(git(fixture.path, 'remote'), '')
  } finally {
    git(repo, 'reset', '-q', '--hard', commit)
  }
})

test('a prepared clone missing a dependency folder is prepared again', async () => {
  const fixture = await preparePackFixture(loadPack(packFolder))
  assert.equal(prepares(), 1)
  rmSync(join(fixture.path, 'sub', 'deps'), { recursive: true, force: true })

  await preparePackFixture(loadPack(packFolder))
  assert.equal(prepares(), 2)
})

test('the ledger entry follows the --pack option, not the fixture', async () => {
  const fixture = await preparePackFixture(loadPack(packFolder))
  const { pack, ...plain } = fixture
  await bench(['run', '--arm', 'baseline', '--pack', packFolder, '--model', 'm1', '--tasks', 'P1', '--runs', '1'], { armsDir, ledgerPath, log: () => {}, fixture: plain })

  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  assert.deepEqual(Object.keys(ledger.runs[0]).sort(), ['arm', 'at', 'costUsd', 'model', 'pack', 'repeat', 'task'])
  assert.equal(ledger.runs[0].pack, PACK_ID)
})

test('a prepare step that exceeds its timeout fails with a clear message', async () => {
  write(join(base, 'slow.mjs'), 'setTimeout(() => {}, 60000)\n')
  writePack({}, { prepare: [{ command: [join(base, 'slow.mjs')] }] })

  await assert.rejects(preparePackFixture(loadPack(packFolder), { timeoutMs: 500 }), /timed out after 1 seconds/)
})
