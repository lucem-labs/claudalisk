import { test } from 'node:test'
import assert from 'node:assert/strict'
import { median, parseCsv, parsePs, percentile, treeMemory, treeOf } from './lib/memory.mjs'

const rows = [
  { pid: 1, ppid: 0, bytes: 100 * 1048576 },
  { pid: 2, ppid: 1, bytes: 50 * 1048576 },
  { pid: 3, ppid: 2, bytes: 25 * 1048576 },
  { pid: 4, ppid: 0, bytes: 900 * 1048576 },
]

test('the tree holds the process and its descendants only', () => {
  assert.deepEqual(treeOf(rows, 1).map((r) => r.pid), [1, 2, 3])
})

test('the tree memory adds the resident sizes in megabytes', () => {
  assert.deepEqual(treeMemory(1, rows), { processes: 3, megabytes: 175 })
})

test('ps output is parsed into kilobytes of resident memory', () => {
  assert.deepEqual(parsePs(' 10 1 2048\nbad line\n 11 10 1024\n'), [{ pid: 10, ppid: 1, bytes: 2097152 }, { pid: 11, ppid: 10, bytes: 1048576 }])
})

test('PowerShell csv output is parsed', () => {
  assert.deepEqual(parseCsv('10,1,2097152\n\n11,10,\n'), [{ pid: 10, ppid: 1, bytes: 2097152 }])
})

test('median and p95 use the nearest rank', () => {
  const values = Array.from({ length: 20 }, (_, i) => i + 1)
  assert.equal(median(values), 10)
  assert.equal(percentile(values, 0.95), 19)
  assert.equal(median([]), null)
})
