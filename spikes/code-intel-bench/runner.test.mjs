import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { benchRoot } from './lib.mjs'
import { cloneFixture } from './fixture-repo.mjs'
import { emptyLedger, readLedger, writeLedger } from './ledger.mjs'
import { pluginCommit, plan, readResults, runAll, runOnce } from './runner.mjs'
import { loadTask } from './tasks.mjs'

const identity = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...identity } }).trim()

let base
let fixture
let tasksFolder
let pluginFolder
let resultsDir
let ledgerPath
let logFile
const arm = { name: 'fake', model: 'm1', settings: 'settings.json', pluginDir: '' }

function write(file, text) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

before(() => {
  base = mkdtempSync(join(tmpdir(), 'bench-runner-'))
  const path = join(base, 'fixture')
  mkdirSync(path)
  git(path, 'init', '-q', '-b', 'main')
  write(join(path, 'app.txt'), 'original\n')
  git(path, 'add', '--all')
  git(path, 'commit', '-q', '-m', 'fixture')
  fixture = { path, head: git(path, 'rev-parse', 'HEAD') }

  tasksFolder = join(base, 'tasks')
  write(join(tasksFolder, 'preamble.md'), 'Work here. No CI.\n')
  for (const id of ['T1', 'T2']) {
    write(join(tasksFolder, id, 'task.json'), JSON.stringify({
      id,
      title: `Task ${id}`,
      prompt: `Write answer.txt for ${id}`,
      features: ['E1'],
      checks: [{ name: 'the answer exists', command: ['node', 'bench-hidden/check.mjs'] }],
    }))
    write(join(tasksFolder, id, 'hidden', 'bench-hidden', 'check.mjs'), "import { existsSync } from 'node:fs'\nprocess.exit(existsSync('answer.txt') ? 0 : 1)\n")
  }

  pluginFolder = join(base, 'plugin')
  write(join(pluginFolder, 'hooks.json'), '{}')
  write(join(pluginFolder, 'spikes', 'secret.txt'), 'hidden')
  arm.pluginDir = pluginFolder
  process.env.CLAUDE_BIN = join(benchRoot, 'test', 'fake-claude.mjs')
})

beforeEach(() => {
  resultsDir = join(base, `results-${Math.random().toString(36).slice(2)}`)
  ledgerPath = join(resultsDir, 'ledger.json')
  logFile = join(resultsDir, 'claude.log')
  mkdirSync(resultsDir, { recursive: true })
  process.env.FAKE_CLAUDE_LOG = logFile
  process.env.FAKE_CLAUDE_SCENARIO = 'success'
  process.env.FAKE_CLAUDE_WRITE = JSON.stringify({ file: 'answer.txt', text: 'done' })
})

after(() => {
  for (const key of ['CLAUDE_BIN', 'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_SCENARIO', 'FAKE_CLAUDE_WRITE']) delete process.env[key]
  rmSync(base, { recursive: true, force: true })
})

const calls = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [])

function once(overrides = {}) {
  return runOnce({ arm, task: loadTask('T1', tasksFolder), repeat: 1, plugin: pluginFolder, claudeCommit: 'abc123', fixture, resultsDir, ledgerPath, ...overrides })
}

test('a run works in a fresh copy of the pinned fixture and sends the prompt on stdin', async () => {
  await once()

  const [call] = calls()
  assert.notEqual(call.cwd, fixture.path)
  assert.match(call.prompt, /Work here\. No CI\./)
  assert.match(call.prompt, /Write answer\.txt for T1/)
  assert.deepEqual(call.args.slice(0, 6), ['-p', '--output-format', 'stream-json', '--verbose', '--plugin-dir', pluginFolder])
  assert.equal(existsSync(join(fixture.path, 'answer.txt')), false)
  assert.equal(existsSync(call.cwd), false)
})

test('an accepted run records its cost, usage, subagents, turns, wall time and each check', async () => {
  const record = await once()

  assert.equal(record.accepted, true)
  assert.equal(record.completed, true)
  assert.equal(record.totalCostUsd, 0.5)
  assert.equal(record.turns, 7)
  assert.equal(record.subagents, 2)
  assert.equal(record.models['claude-sonnet-5-5'].cacheRead, 5000)
  assert.equal(typeof record.wallMs, 'number')
  assert.equal(record.claudaliskCommit, 'abc123')
  assert.equal(record.fixtureHead, fixture.head)
  assert.equal(record.model, 'm1')
  assert.equal(record.settingSources, 'project,local')
  const sources = record.claudeArguments.indexOf('--setting-sources')
  assert.deepEqual(record.claudeArguments.slice(sources, sources + 2), ['--setting-sources', 'project,local'])
  assert.equal(record.claudeArguments[record.claudeArguments.indexOf('--model') + 1], 'm1')
  assert.deepEqual(record.checks.map(({ name, passed }) => ({ name, passed })), [{ name: 'the answer exists', passed: true }])
  const [file] = readdirSync(join(resultsDir, 'fake', 'm1'))
  assert.match(file, /^\d{8}T\d{6}Z-T1-1\.json$/)
  assert.equal(JSON.parse(readFileSync(join(resultsDir, 'fake', 'm1', file), 'utf8')).accepted, true)
})

test('the hidden tests are copied in after the agent finishes, and a failing check rejects the run', async () => {
  process.env.FAKE_CLAUDE_WRITE = JSON.stringify({ file: 'other.txt', text: 'x' })

  const record = await once()

  assert.equal(record.completed, true)
  assert.equal(record.accepted, false)
  assert.equal(record.checks[0].passed, false)
  assert.equal(record.checks[0].exitCode, 1)
})

test('a run that exceeds its budget fails, keeps its cost and is added to the ledger', async () => {
  process.env.FAKE_CLAUDE_SCENARIO = 'budget'

  const record = await once()

  assert.equal(record.checks[0].passed, true)
  assert.equal(record.accepted, false)
  assert.equal(record.isError, true)
  assert.equal(record.subtype, 'error_max_budget_usd')
  assert.equal(record.totalCostUsd, 3.02)
  assert.equal(readLedger(ledgerPath).spentUsd, 3.02)
})

test('a run whose claude exits with no result is a failed run charged the run cap', async () => {
  process.env.FAKE_CLAUDE_SCENARIO = 'crash'

  const record = await once()

  assert.equal(record.accepted, false)
  assert.equal(record.subtype, 'no_result')
  assert.equal(record.exitCode, 1)
  assert.equal(record.totalCostUsd, 3)
  assert.equal(record.costEstimated, true)
  assert.equal(readLedger(ledgerPath).spentUsd, 3)
})

test('a run is refused before claude starts when its cap would cross the budget', async () => {
  writeLedger(ledgerPath, { ...emptyLedger(), spentUsd: 148 })

  await assert.rejects(once(), /Refusing to start a run/)

  assert.deepEqual(calls(), [])
  assert.deepEqual(readdirSync(resultsDir), ['ledger.json'])
})

test('the ledger is written after each run, so the next run sees it', async () => {
  const lines = []
  writeLedger(ledgerPath, { ...emptyLedger(), spentUsd: 146.5 })

  await assert.rejects(
    runAll({ arm, tasks: ['T1', 'T2'], runs: 3, resultsDir, ledgerPath, fixture, tasksFolder, log: (line) => lines.push(line) }),
    /Refusing to start a run/,
  )

  assert.equal(readLedger(ledgerPath).spentUsd, 147.5)
  assert.equal(readLedger(ledgerPath).runs.length, 2)
  assert.equal(calls().length, 2)
})

test('repeats are numbered after the ones already recorded, one pass over the tasks at a time', async () => {
  await runAll({ arm, tasks: ['T1', 'T2'], runs: 2, resultsDir, ledgerPath, fixture, tasksFolder, log: () => {} })
  await runAll({ arm, tasks: ['T1'], runs: 1, resultsDir, ledgerPath, fixture, tasksFolder, log: () => {} })

  const numbers = readLedger(ledgerPath).runs.map((entry) => `${entry.task}-${entry.repeat}`)
  assert.deepEqual(numbers, ['T1-1', 'T2-1', 'T1-2', 'T2-2', 'T1-3'])
  assert.deepEqual(plan({ tasks: ['T2'], runs: 1, resultsDir, arm: 'fake', model: 'm1' }), [{ task: 'T2', repeat: 3 }])
  assert.deepEqual(plan({ tasks: ['T2', 'T1'], runs: 2, resultsDir, arm: 'fake', model: 'm1' }), [
    { task: 'T2', repeat: 3 },
    { task: 'T2', repeat: 4 },
    { task: 'T1', repeat: 4 },
  ])
})

test('a re-run of one task fills the lowest repeat that lacks it', async () => {
  await runAll({ arm, tasks: ['T1', 'T2'], runs: 3, resultsDir, ledgerPath, fixture, tasksFolder, log: () => {} })
  for (const name of readdirSync(join(resultsDir, 'fake', 'm1'))) {
    if (/-T2-2.json$/.test(name)) rmSync(join(resultsDir, 'fake', 'm1', name))
  }

  assert.deepEqual(plan({ tasks: ['T2'], runs: 1, resultsDir, arm: 'fake', model: 'm1' }), [{ task: 'T2', repeat: 2 }])
  assert.deepEqual(plan({ tasks: ['T1', 'T2'], runs: 2, resultsDir, arm: 'fake', model: 'm1' }), [
    { task: 'T2', repeat: 2 },
    { task: 'T1', repeat: 4 },
    { task: 'T2', repeat: 4 },
  ])
})

test('the cost reaches the ledger and a partial record before the hidden checks run', async () => {
  const checkRun = async () => { throw new Error('interrupted') }

  await assert.rejects(once({ checkRun }), /interrupted/)

  assert.equal(readLedger(ledgerPath).spentUsd, 0.5)
  const [file] = readdirSync(join(resultsDir, 'fake', 'm1'))
  const saved = JSON.parse(readFileSync(join(resultsDir, 'fake', 'm1', file), 'utf8'))
  assert.equal(saved.totalCostUsd, 0.5)
  assert.equal(saved.checksPending, true)
  assert.equal(saved.accepted, false)
})

test('changes under spikes do not make the plugin commit dirty', async () => {
  const repo = join(base, 'plugin-repo')
  write(join(repo, 'hooks.json'), '{}')
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'add', '--all')
  git(repo, 'commit', '-q', '-m', 'plugin')
  const head = git(repo, 'rev-parse', 'HEAD')

  write(join(repo, 'spikes', 'out.txt'), 'x')
  assert.equal(await pluginCommit(repo), head)

  write(join(repo, 'hooks.json'), '{"a":1}')
  assert.equal(await pluginCommit(repo), `${head}-dirty`)
})

test('the plugin the agent sees leaves out spikes', async () => {
  const seen = []
  const exec = async (command, args, options) => {
    const plugin = args[args.indexOf('--plugin-dir') + 1]
    seen.push({ spikes: existsSync(join(plugin, 'spikes')), hooks: existsSync(join(plugin, 'hooks.json')) })
    return { code: 0, stdout: '', stderr: '', timedOut: false, options }
  }

  await runAll({ arm, tasks: ['T1'], runs: 1, resultsDir, ledgerPath, fixture, tasksFolder, exec, log: () => {} })

  assert.deepEqual(seen, [{ spikes: false, hooks: true }])
})

test('a copy of the fixture is refused when its HEAD is not the pinned one', async () => {
  const destination = join(base, 'copy-wrong')

  await assert.rejects(cloneFixture(destination, { fixture: { ...fixture, head: '0'.repeat(40) } }), /not the pinned/)

})

test('results, ledger entries and repeat numbers are per arm and model', async () => {
  const other = { ...arm, model: 'm2' }
  await runAll({ arm, tasks: ['T1'], runs: 2, resultsDir, ledgerPath, fixture, tasksFolder, log: () => {} })
  await runAll({ arm: other, tasks: ['T1'], runs: 1, resultsDir, ledgerPath, fixture, tasksFolder, log: () => {} })

  assert.equal(readdirSync(join(resultsDir, 'fake', 'm1')).length, 2)
  assert.equal(readdirSync(join(resultsDir, 'fake', 'm2')).length, 1)
  const entries = readLedger(ledgerPath).runs.map((entry) => [entry.model, entry.repeat, entry.file.split('/').slice(0, 2).join('/')])
  assert.deepEqual(entries, [['m1', 1, 'fake/m1'], ['m1', 2, 'fake/m1'], ['m2', 1, 'fake/m2']])
  assert.equal(readResults(resultsDir, 'fake', 'm2')[0].model, 'm2')
  assert.deepEqual(plan({ tasks: ['T1'], runs: 1, resultsDir, arm: 'fake', model: 'm2' }), [{ task: 'T1', repeat: 2 }])
})
