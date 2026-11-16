import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { LEDGER_ENV, addRun, assertRoom, defaultLedgerPath, emptyLedger, mergeLedgers, readLedger, reserveRun, room, settleRun, spentByArm, withLock, writeLedger } from './ledger.mjs'
import { repositoryRoot } from './lib.mjs'

const entry = (costUsd, arm = 'baseline') => ({ arm, model: 'm1', task: 'T1', repeat: 1, file: 'x.json', costUsd, at: '2026-01-01T00:00:00.000Z' })

test('a missing ledger starts empty with the epic budget', () => {
  const ledger = readLedger(join(tmpdir(), 'no-such-ledger.json'))

  assert.equal(ledger.spentUsd, 0)
  assert.equal(ledger.capUsd, 150)
  assert.equal(ledger.runCapUsd, 3)
})

test('a run is refused when its cap would cross the budget', () => {
  assert.doesNotThrow(() => assertRoom({ ...emptyLedger(), spentUsd: 147 }))
  assert.throws(() => assertRoom({ ...emptyLedger(), spentUsd: 147.01 }), /Refusing to start a run/)
  assert.throws(() => assertRoom({ ...emptyLedger(), spentUsd: 150 }), /150.00 budget/)
})

test('the room left counts the run cap', () => {
  assert.equal(room({ ...emptyLedger(), spentUsd: 100 }), 47)
})

test('each run adds its cost, and the ledger on disk is current before the next run', () => {
  const folder = mkdtempSync(join(tmpdir(), 'ledger-'))
  const file = join(folder, 'results', 'ledger.json')
  try {
    writeLedger(file, addRun(readLedger(file), entry(1.25)))
    assert.equal(readLedger(file).spentUsd, 1.25)

    writeLedger(file, addRun(readLedger(file), entry(0.1 + 0.2, 'other')))
    const ledger = JSON.parse(readFileSync(file, 'utf8'))

    assert.equal(ledger.spentUsd, 1.55)
    assert.equal(ledger.runs.length, 2)
    assert.equal(ledger.runs[0].model, 'm1')
    assert.deepEqual(spentByArm(ledger), { baseline: 1.25, other: 0.3 })
    assert.equal(existsSync(`${file}.tmp`), false)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('the ledger defaults to one file per machine outside any checkout, and the env var overrides it', () => {
  const home = join(tmpdir(), 'home')
  const path = defaultLedgerPath({}, home)

  assert.equal(path, join(home, '.claudalisk', 'code-intel-bench', 'ledger.json'))
  assert.equal(path.startsWith(repositoryRoot), false)
  assert.equal(defaultLedgerPath({ [LEDGER_ENV]: '/elsewhere/ledger.json' }, home), '/elsewhere/ledger.json')
})

test('a reservation charges the run cap until the run settles, so a crashed run stays charged', () => {
  const folder = mkdtempSync(join(tmpdir(), 'ledger-'))
  const file = join(folder, 'ledger.json')
  try {
    const crashed = reserveRun(file, { arm: 'a', model: 'm1', task: 'T1', repeat: 1, at: '2026-01-01T00:00:00.000Z' })
    const settled = reserveRun(file, { arm: 'a', model: 'm1', task: 'T2', repeat: 1, at: '2026-01-01T00:00:01.000Z' })
    assert.equal(readLedger(file).spentUsd, 6)

    settleRun(file, settled, { file: 'a/m1/x-T2-1.json', costUsd: 0.4, at: '2026-01-01T00:01:00.000Z' })
    const ledger = readLedger(file)

    assert.equal(ledger.spentUsd, 3.4)
    assert.equal(ledger.runs.find((entry) => entry.task === 'T2').reserved, undefined)
    assert.equal(ledger.runs.find((entry) => entry.task === 'T1').reserved, crashed)
    assert.equal(existsSync(`${file}.lock`), false)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('a reservation is refused when the cap would cross the budget, and nothing is written', () => {
  const folder = mkdtempSync(join(tmpdir(), 'ledger-'))
  const file = join(folder, 'ledger.json')
  try {
    writeLedger(file, { ...emptyLedger(), spentUsd: 147.5 })

    assert.throws(() => reserveRun(file, { arm: 'a', model: 'm1', task: 'T1', repeat: 1, at: 'now' }), /Refusing to start a run/)
    assert.equal(readLedger(file).runs.length, 0)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('a lock left by another run is waited for, and a stale one is taken over', () => {
  const folder = mkdtempSync(join(tmpdir(), 'ledger-'))
  const file = join(folder, 'ledger.json')
  try {
    writeFileSync(`${file}.lock`, '')
    const old = new Date(Date.now() - 120_000)
    utimesSync(`${file}.lock`, old, old)

    withLock(file, (ledger) => addRun(ledger, entry(1)))

    assert.equal(readLedger(file).spentUsd, 1)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('merging per-worktree ledgers counts every run once', () => {
  const run = (task, repeat, costUsd) => ({ arm: 'baseline', model: 'm1', task, repeat, file: `baseline/m1/${task}-${repeat}.json`, costUsd, at: `2026-01-0${repeat}T00:00:00.000Z` })
  const older = addRun(addRun(emptyLedger(), run('T1', 1, 1)), run('T2', 1, 2))
  const newer = addRun(older, run('T1', 2, 0.5))

  const merged = mergeLedgers(emptyLedger(), [older, newer, newer])

  assert.equal(merged.runs.length, 3)
  assert.equal(merged.spentUsd, 3.5)
  assert.equal(mergeLedgers(merged, [older]).spentUsd, 3.5)
})
