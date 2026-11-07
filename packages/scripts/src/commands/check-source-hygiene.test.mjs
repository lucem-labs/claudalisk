import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeRunner } from '../fake-runner.mjs'
import { checkSourceHygiene, inFixtures, isBinary, suspectCharacters } from './check-source-hygiene.mjs'

const lines = (...codePoints) => codePoints.map((codePoint) => `a${String.fromCodePoint(codePoint)}b`).join('\n')

test('a BOM at the start of a file is fine and anywhere else is not', () => {
  assert.deepEqual(suspectCharacters('﻿const a = 1\n'), [])
  assert.deepEqual(suspectCharacters('const a = 1\n﻿const b = 2\n'), [{ line: 2, codePoint: 0xfeff }])
  assert.deepEqual(suspectCharacters('﻿﻿x'), [{ line: 1, codePoint: 0xfeff }])
})

test('zero-width characters are found', () => {
  assert.deepEqual(suspectCharacters(lines(0x200b, 0x200c, 0x200d, 0x2060)).map((item) => item.codePoint), [0x200b, 0x200c, 0x200d, 0x2060])
})

test('bidirectional controls are found', () => {
  const all = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c]
  assert.deepEqual(suspectCharacters(lines(...all)).map((item) => item.codePoint), all)
})

test('ordinary text, accents, emoji and CJK pass', () => {
  assert.deepEqual(suspectCharacters('café \u{1F600} 中文    \n'), [])
})

test('the same character twice on a line is reported once', () => {
  assert.equal(suspectCharacters('a​​b').length, 1)
})

test('binary files and fixtures folders are recognised', () => {
  assert.ok(isBinary(Buffer.from([0x89, 0x50, 0, 0x0a])))
  assert.ok(!isBinary(Buffer.from('text')))
  assert.ok(inFixtures('backend/Tests/fixtures/a.txt'))
  assert.ok(inFixtures('fixtures/a.txt'))
  assert.ok(!inFixtures('src/fixtures.ts'))
  assert.ok(!inFixtures('fixtures'))
})

async function check(files, argv = [], env = {}) {
  const runner = fakeRunner(() => ({ stdout: Object.keys(files).map((file) => `${file}\0`).join('') }))
  const out = []
  const err = []
  const code = await checkSourceHygiene({ appRoot: '/repo', argv, env, runner, read: (file) => Buffer.from(files[file]), log: (t) => out.push(t), error: (t) => err.push(t) })
  return { code, out, err }
}

test('clean tracked files pass', async () => {
  const result = await check({ 'a.ts': 'export {}\n', 'b.cs': '﻿class B {}\n' })
  assert.deepEqual(result, { code: 0, out: [], err: [] })
})

test('a finding is listed with file, line and what it is', async () => {
  const result = await check({ 'a.ts': 'ok\nconst x = "a‮b"\n' })
  assert.equal(result.code, 1)
  assert.match(result.err[0], /a\.ts:2: U\+202E right-to-left override/)
})

test('GitHub Actions gets an annotation with file and line', async () => {
  const result = await check({ 'a.ts': 'ok\nx​\n' }, [], { GITHUB_ACTIONS: 'true' })
  assert.deepEqual(result.out, ['::error file=a.ts,line=2::U+200B zero-width space (CLA-0071)'])
})

test('binary files, fixtures and skipped paths are left out', async () => {
  const result = await check({
    'logo.png': '​\0​',
    'tests/fixtures/odd.txt': '​',
    'vendor/lib.js': '​',
    'vendor2/lib.js': 'ok',
  }, ['--skip', './vendor/'])
  assert.equal(result.code, 0)
})

test('a path that only starts like a skipped one is still checked', async () => {
  const result = await check({ 'vendors/lib.js': '​' }, ['--skip', 'vendor'])
  assert.equal(result.code, 1)
})

test('an unknown argument is refused', async () => {
  await assert.rejects(check({}, ['--fix']), /Unknown option/)
})
