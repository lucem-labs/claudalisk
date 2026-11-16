import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { commandLine } from './lib.mjs'
import { accepted, installHidden, loadTask, parseTaskList, runChecks, taskIds } from './tasks.mjs'

test('the suite has the seven tasks of the benchmark', () => {
  assert.deepEqual(taskIds(), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'])
})

test('every task has a prompt, catalogue features, checks, hidden tests and a reference solution', () => {
  for (const id of taskIds()) {
    const task = loadTask(id)

    assert.equal(task.id, id)
    assert.ok(task.title.length > 0)
    assert.ok(task.checks.length > 0)
    assert.ok(task.features.every((feature) => /^[A-Z]\d+$/.test(feature)))
    assert.match(task.prompt, /no remote, no CI and no issue/)
    assert.match(task.prompt, /do not commit, push, branch or open a pull request/i)
    assert.equal(existsSync(join(task.folder, 'hidden')), true)
    assert.equal(existsSync(join(task.folder, 'reference', 'solution.patch')), true)
  }
})

test('the control task names no feature', () => {
  assert.deepEqual(loadTask('T7').features, [])
})

test('a task list selects known tasks in order and rejects unknown ones', () => {
  assert.deepEqual(parseTaskList('T3, T1'), ['T1', 'T3'])
  assert.equal(parseTaskList(undefined).length, 7)
  assert.throws(() => parseTaskList('T1,T9'), /Unknown tasks: T9/)
})

test('the hidden folder is copied over the run copy and each check is recorded', async () => {
  const base = mkdtempSync(join(tmpdir(), 'tasks-'))
  try {
    const folder = join(base, 'T1')
    mkdirSync(join(folder, 'hidden', 'bench-hidden'), { recursive: true })
    writeFileSync(join(folder, 'hidden', 'bench-hidden', 'ok.mjs'), 'process.exit(0)\n')
    writeFileSync(join(folder, 'hidden', 'bench-hidden', 'bad.mjs'), 'console.error("nope")\nprocess.exit(3)\n')
    const task = { id: 'T1', folder, checks: [{ name: 'good', command: ['node', 'bench-hidden/ok.mjs'] }, { name: 'bad', command: ['node', 'bench-hidden/bad.mjs'] }] }
    const copy = join(base, 'copy')
    mkdirSync(copy)

    installHidden(task, copy)
    const results = await runChecks(task, copy)

    assert.equal(existsSync(join(copy, 'bench-hidden', 'ok.mjs')), true)
    assert.deepEqual(results.map(({ name, passed, exitCode }) => ({ name, passed, exitCode })), [
      { name: 'good', passed: true, exitCode: 0 },
      { name: 'bad', passed: false, exitCode: 3 },
    ])
    assert.match(results[1].tail, /nope/)
    assert.equal(accepted(results), false)
    assert.equal(accepted(results.slice(0, 1)), true)
    assert.equal(accepted([]), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('a check runs in its own folder inside the copy', async () => {
  const base = mkdtempSync(join(tmpdir(), 'tasks-'))
  try {
    mkdirSync(join(base, 'sub'))
    writeFileSync(join(base, 'sub', 'where.mjs'), 'process.exit(process.cwd().endsWith("sub") ? 0 : 1)\n')

    const results = await runChecks({ checks: [{ name: 'cwd', cwd: 'sub', command: ['node', 'where.mjs'] }] }, base)

    assert.equal(results[0].passed, true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('on Windows a command goes through the shell with quoting, and a script runs with node', () => {
  assert.deepEqual(commandLine('npm', ['run', 'type check'], 'win32'), ['npm run "type check"', [], { shell: true }])
  assert.deepEqual(commandLine('npm', ['test'], 'linux'), ['npm', ['test'], {}])
  const [file, args] = commandLine('fake.mjs', ['-p'], 'win32')
  assert.equal(file, process.execPath)
  assert.deepEqual(args, ['fake.mjs', '-p'])
})

test('the prompts describe the work and never the hidden tests or the reference solution', () => {
  for (const id of taskIds()) assert.doesNotMatch(loadTask(id).prompt, /hidden|bench-hidden|reference solution/i)
})
