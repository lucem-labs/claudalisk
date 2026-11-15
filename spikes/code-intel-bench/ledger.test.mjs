import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addRun, assertRoom, emptyLedger, readLedger, room, spentByArm, writeLedger } from './ledger.mjs'

const entry = (costUsd, arm = 'baseline') => ({ arm, task: 'T1', repeat: 1, file: 'x.json', costUsd, at: '2026-01-01T00:00:00.000Z' })

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
    assert.deepEqual(spentByArm(ledger), { baseline: 1.25, other: 0.3 })
    assert.equal(existsSync(`${file}.tmp`), false)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
