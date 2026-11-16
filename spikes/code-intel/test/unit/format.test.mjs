import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambiguousText, callsText, candidatesText, diagnosticsText, groupByFile, locationsText, referencesText, symbolsText, truncate } from '../../lib/format.mjs'

const locations = [
  { path: 'b.cs', line: 9 },
  { path: 'a.cs', line: 30 },
  { path: 'a.cs', line: 4 },
  { path: 'a.cs', line: 4 },
]

test('locations are grouped by file, sorted, and a repeated line is listed once', () => {
  assert.deepEqual([...groupByFile(locations)], [['a.cs', [4, 30]], ['b.cs', [9]]])
  assert.equal(locationsText(locations), 'a.cs:4,30\nb.cs:9')
  assert.equal(locationsText([]), 'none')
})

test('references show a total, per-file counts and flag a count that never settled', () => {
  assert.equal(referencesText(locations.slice(0, 3)), '3 references in 2 files\na.cs (2): 4,30\nb.cs (1): 9')
  assert.match(referencesText(locations, { stable: false }), /count was still changing/)
  assert.equal(referencesText([]), 'no references')
})

test('calls are one line each, sorted and without duplicates', () => {
  const text = callsText([{ name: 'B', path: 'b.cs', line: 2 }, { name: 'A', path: 'a.cs', line: 1 }, { name: 'A', path: 'a.cs', line: 1 }])
  assert.equal(text, 'A a.cs:1\nB b.cs:2')
})

test('the ambiguity message lists at most ten candidates and counts the rest', () => {
  const candidates = Array.from({ length: 14 }, (_, i) => ({ qualified: `N.T.M${i}`, kind: 6, path: 'a.cs', line: i + 1 }))
  const text = ambiguousText('M', candidates)
  assert.match(text, /^ambiguous: 14 symbols match "M"/)
  assert.equal(text.split('\n').length, 1 + 10 + 1)
  assert.match(candidatesText(candidates), /N\.T\.M0 \(Method\) a\.cs:1/)
  assert.match(text, /\.\.\. and 4 more$/)
})

test('diagnostics are path:line severity message, first message line only, capped', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ path: 'a.cs', line: i + 1, severity: 1, message: `bad ${i}\nmore` }))
  const text = diagnosticsText(items)
  assert.equal(text.split('\n')[0], 'a.cs:1 error bad 0')
  assert.equal(text.split('\n').length, 21)
  assert.equal(diagnosticsText([]), 'no diagnostics')
})

test('symbols are indented by depth with their kind and line', () => {
  assert.equal(symbolsText([{ name: 'A', kind: 5, line: 1, depth: 0 }, { name: 'm', kind: 6, line: 3, depth: 1 }]), 'A Class :1\n  m Method :3')
})

test('long text is cut at the cap and says how much is missing', () => {
  assert.equal(truncate('abc', 10), 'abc')
  assert.equal(truncate('abcdef', 3), 'abc\n... truncated, 3 more characters')
})
