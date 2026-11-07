import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeRunner } from '../fake-runner.mjs'
import { checkSuppressions, csharpSuppressions, expiryProblem, findSuppressionProblems } from './check-suppressions.mjs'

const today = '2026-11-07'

test('a date from today to 90 days away is fine', () => {
  assert.equal(expiryProblem('2026-11-07', today), null)
  assert.equal(expiryProblem('2027-02-05', today), null)
})

test('a past date, a date more than 90 days away and a date that does not exist are problems', () => {
  assert.match(expiryProblem('2026-11-06', today), /already past/)
  assert.match(expiryProblem('2027-02-06', today), /more than 90 days away/)
  assert.match(expiryProblem('2026-02-30', today), /not a calendar date/)
  assert.match(expiryProblem('2026-13-01', today), /not a calendar date/)
})

test('SuppressMessage attributes are read with their justification and date', () => {
  const text = [
    '[assembly: SuppressMessage("Security", "CA2100", Justification = "Reviewed. Until 2026-12-01.")]',
    'class A',
    '{',
    '    [System.Diagnostics.CodeAnalysis.SuppressMessage("Security", "CA2100", Scope = "member", Justification = "A, B"',
    '        + " and more. Until 2026-12-02.")]',
    '    void M() {}',
    '    [SuppressMessage("Security", "CA2100")]',
    '    void N() {}',
    '    [SuppressMessage("Security", "CA2100", Justification = "No date.")]',
    '    void O() {}',
    '}',
  ].join('\n')
  assert.deepEqual(csharpSuppressions(text), [
    { line: 1, justification: 'Reviewed. Until 2026-12-01.', date: '2026-12-01' },
    { line: 4, justification: 'A, B and more. Until 2026-12-02.', date: '2026-12-02' },
    { line: 7, justification: null, date: null },
    { line: 9, justification: 'No date.', date: null },
  ])
})

test('verbatim strings, escapes and parentheses inside strings do not confuse the attribute', () => {
  const text = 'class A { [SuppressMessage("S", "X(1)", Justification = @"Why ""x"") Until 2026-12-01.")] void M() {} [SuppressMessage("S", "X", Justification = "a\\"b) Until 2026-12-01.")] void N() {} }'
  assert.deepEqual(csharpSuppressions(text).map((item) => item.date), ['2026-12-01', '2026-12-01'])
})

test('a C# file is judged by every suppression in it', () => {
  const file = 'A.cs'
  const good = '[SuppressMessage("S", "X", Justification = "Why. Until 2026-12-01.")]'
  assert.deepEqual(findSuppressionProblems(file, good, today), [])
  assert.match(findSuppressionProblems(file, '[SuppressMessage("S", "X")]', today)[0].message, /no Justification/)
  assert.match(findSuppressionProblems(file, '[SuppressMessage("S", "X", Justification = "Why.")]', today)[0].message, /does not end 'Until yyyy-MM-dd\.'/)
  assert.match(findSuppressionProblems(file, '[SuppressMessage("S", "X", Justification = "Until 2026-12-01")]', today)[0].message, /does not end/)
  assert.match(findSuppressionProblems(file, '[SuppressMessage("S", "X", Justification = "Why. Until 2026-10-01.")]', today)[0].message, /already past/)
  assert.match(findSuppressionProblems(file, '[SuppressMessage("S", "X", Justification = "Why. Until 2027-06-01.")]', today)[0].message, /more than 90 days/)
})

test('osv-scanner.toml needs a valid ignoreUntil on every ignored vulnerability', () => {
  const file = 'osv-scanner.toml'
  assert.deepEqual(findSuppressionProblems(file, '', today), [])
  const text = [
    '[[IgnoredVulns]]',
    'id = "GHSA-1"',
    'ignoreUntil = 2026-12-01',
    'reason = "Waiting for a release"',
    '',
    '[[IgnoredVulns]]',
    'id = "GHSA-2"',
    'ignoreUntil = 2026-12-01T00:00:00Z',
    '',
    '[[IgnoredVulns]]',
    'id = "GHSA-3"',
    'ignoreUntil = "2026-10-01"',
    '',
    '[[IgnoredVulns]]',
    'id = "GHSA-4"',
    'reason = "forever"',
    '',
    '[[IgnoredVulns]]',
    'id = "GHSA-5"',
    'ignoreUntil = 2027-09-01',
  ].join('\n')
  assert.deepEqual(findSuppressionProblems(file, text, today).map((item) => [item.line, item.message]), [
    [10, 'ignoreUntil: 2026-10-01 is already past (CLA-0071)'],
    [14, 'ignoreUntil is missing or has no yyyy-MM-dd date (CLA-0071)'],
    [18, 'ignoreUntil: 2027-09-01 is more than 90 days away (CLA-0071)'],
  ])
})

test('a package override is judged only when it ignores the package', () => {
  const file = 'osv-scanner.toml'
  const text = '[[PackageOverrides]]\nname = "a"\nlicense.override = ["MIT"]\n\n[[PackageOverrides]]\nname = "b"\nignore = true\n'
  const problems = findSuppressionProblems(file, text, today)
  assert.deepEqual(problems.map((item) => item.line), [5])
})

test('.trivyignore.yaml needs a valid expired_at on every entry', () => {
  const file = '.trivyignore.yaml'
  assert.deepEqual(findSuppressionProblems(file, 'misconfigurations: []\nvulnerabilities: []\n', today), [])
  const text = [
    'vulnerabilities:',
    '  - id: CVE-1',
    '    expired_at: 2026-12-01',
    '    statement: Waiting for a release',
    '  - id: CVE-2',
    '    statement: forever',
    '  - id: CVE-3',
    '    expired_at: 2026-01-01',
    'misconfigurations:',
    '- id: AVD-1',
    '  expired_at: "2027-12-01"',
    '- id: AVD-2',
    '  expired_at: 2026-11-30',
  ].join('\n')
  assert.deepEqual(findSuppressionProblems(file, text, today).map((item) => [item.line, item.message]), [
    [5, 'expired_at is missing or has no yyyy-MM-dd date (CLA-0071)'],
    [7, 'expired_at: 2026-01-01 is already past (CLA-0071)'],
    [10, 'expired_at: 2027-12-01 is more than 90 days away (CLA-0071)'],
  ])
})

test('other files are not judged', () => {
  assert.deepEqual(findSuppressionProblems('a.ts', '[SuppressMessage("S", "X")]', today), [])
})

async function check(files, env = {}) {
  const runner = fakeRunner(() => ({ stdout: Object.keys(files).map((file) => `${file}\0`).join('') }))
  const out = []
  const err = []
  const code = await checkSuppressions({ appRoot: '/repo', argv: [], env, runner, now: () => new Date('2026-11-07T23:30:00Z'), read: (file) => files[file], log: (t) => out.push(t), error: (t) => err.push(t) })
  return { code, out, err }
}

test('the command reads the C# files and the two suppression files and passes when all are valid', async () => {
  const result = await check({
    'backend/A.cs': '[SuppressMessage("S", "X", Justification = "Why. Until 2026-12-01.")]\r\nclass A {}\r\n',
    'osv-scanner.toml': '',
    '.trivyignore.yaml': 'vulnerabilities: []\n',
    'README.md': '[SuppressMessage("S", "X")]',
  })
  assert.deepEqual(result, { code: 0, out: [], err: [] })
})

test('the command fails with annotations for file and line', async () => {
  const result = await check({ 'backend/A.cs': 'class A {}\n[SuppressMessage("S", "X")]\n' }, { GITHUB_ACTIONS: 'true' })
  assert.equal(result.code, 1)
  assert.deepEqual(result.out, ['::error file=backend/A.cs,line=2::SuppressMessage has no Justification (CLA-0071)'])
  assert.match(result.err[0], /backend\/A\.cs:2:/)
})

test('today comes from the injected clock, in UTC', async () => {
  const result = await check({ 'backend/A.cs': '[SuppressMessage("S", "X", Justification = "Why. Until 2026-11-07.")]' })
  assert.equal(result.code, 0)
})
