import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeRunner } from '../fake-runner.mjs'
import { checkSourceHygiene, inFixtures, isBinary, suspectCharacters } from './check-source-hygiene.mjs'

const lines = (...codePoints) => codePoints.map((codePoint) => `a${String.fromCodePoint(codePoint)}b`).join('\n')

test('a BOM at the start of a file is fine and anywhere else is not', () => {
  assert.deepEqual(suspectCharacters('\uFEFFconst a = 1\n'), [])
  assert.deepEqual(suspectCharacters('const a = 1\n\uFEFFconst b = 2\n'), [{ line: 2, codePoint: 0xfeff }])
  assert.deepEqual(suspectCharacters('\uFEFF\uFEFFx'), [{ line: 1, codePoint: 0xfeff }])
})

test('zero-width characters are found', () => {
  assert.deepEqual(suspectCharacters(lines(0x200b, 0x200c, 0x200d, 0x2060)).map((item) => item.codePoint), [0x200b, 0x200c, 0x200d, 0x2060])
})

test('bidirectional controls are found', () => {
  const all = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c]
  assert.deepEqual(suspectCharacters(lines(...all)).map((item) => item.codePoint), all)
})

test('ordinary text, accents, emoji and CJK pass', () => {
  assert.deepEqual(suspectCharacters('café \u{1F600} 中文 \u00A0\u2003\u3000\n'), [])
})

test('the same character twice on a line is reported once', () => {
  assert.equal(suspectCharacters('a\u200B\u200Bb').length, 1)
})

test('binary files and fixtures folders are recognised', () => {
  assert.ok(isBinary(Buffer.from([0x89, 0x50, 0, 0x0a])))
  assert.ok(!isBinary(Buffer.from('text')))
  assert.ok(inFixtures('backend/Tests/fixtures/a.txt'))
  assert.ok(inFixtures('fixtures/a.txt'))
  assert.ok(!inFixtures('src/fixtures.ts'))
  assert.ok(!inFixtures('fixtures'))
})

async function check(files, argv = [], env = {}, gone = {}) {
  const runner = fakeRunner(() => ({ stdout: Object.keys(files).map((file) => `${file}\0`).join('') }))
  const out = []
  const err = []
  const code = await checkSourceHygiene({ appRoot: '/repo', argv, env, runner, regular: (file) => !(file in gone), read: (file) => Buffer.from(files[file]), log: (t) => out.push(t), error: (t) => err.push(t) })
  return { code, out, err }
}

test('clean tracked files pass', async () => {
  const result = await check({ 'a.ts': 'export {}\n', 'b.cs': '\uFEFFclass B {}\n' })
  assert.deepEqual(result, { code: 0, out: [], err: [] })
})

test('a finding is listed with file, line and what it is', async () => {
  const result = await check({ 'a.ts': 'ok\nconst x = "a\u202Eb"\n' })
  assert.equal(result.code, 1)
  assert.match(result.err[0], /a\.ts:2: U\+202E right-to-left override/)
})

test('GitHub Actions gets an annotation with file and line', async () => {
  const result = await check({ 'a.ts': 'ok\nx\u200B\n' }, [], { GITHUB_ACTIONS: 'true' })
  assert.deepEqual(result.out, ['::error file=a.ts,line=2::U+200B zero-width space (CLA-0071)'])
})

test('binary files, fixtures and skipped paths are left out', async () => {
  const result = await check({
    'logo.png': '\u200B\0\u200B',
    'tests/fixtures/odd.txt': '\u200B',
    'vendor/lib.js': '\u200B',
    'vendor2/lib.js': 'ok',
  }, ['--skip', './vendor/'])
  assert.equal(result.code, 0)
})

test('a path that only starts like a skipped one is still checked', async () => {
  const result = await check({ 'vendors/lib.js': '\u200B' }, ['--skip', 'vendor'])
  assert.equal(result.code, 1)
})

test('more invisible characters are found', () => {
  const all = [0x00ad, 0x180e, 0x2028, 0x2029, 0x2061, 0x2062, 0x2063, 0x2064, 0xfe00, 0xfe0f, 0xe0000, 0xe0041, 0xe007f, 0xe0100, 0xe01ef]
  assert.deepEqual(suspectCharacters(lines(...all)).map((item) => item.codePoint), all)
})

test('names are given to the new characters', async () => {
  const result = await check({ 'a.ts': lines(0xfe0f, 0xe0041, 0xe0100, 0x00ad) })
  assert.match(result.err[0], /U\+FE0F variation selector/)
  assert.match(result.err[0], /U\+E0041 tag character/)
  assert.match(result.err[0], /U\+E0100 variation selector supplement/)
  assert.match(result.err[0], /U\+00AD soft hyphen/)
})

test('tracked paths that are not regular files are skipped', async () => {
  const result = await check({ 'gone.ts': '\u200B', link: '\u200B' }, [], {}, { 'gone.ts': true, link: true })
  assert.equal(result.code, 0)
})

test('the real check skips a tracked path that is missing on disk', async () => {
  const runner = fakeRunner(() => ({ stdout: 'does-not-exist.ts\0' }))
  const code = await checkSourceHygiene({ appRoot: '/nowhere', argv: [], env: {}, runner, log: () => {}, error: () => {} })
  assert.equal(code, 0)
})

test('an unknown argument is refused', async () => {
  await assert.rejects(check({}, ['--fix']), /Unknown option/)
})
