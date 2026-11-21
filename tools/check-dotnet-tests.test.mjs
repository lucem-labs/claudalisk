import assert from 'node:assert/strict'
import test from 'node:test'
import { projectPath, ranTests, testTotal } from './check-dotnet-tests.mjs'

const summary = (total) => `Test run summary: Passed!\n  total: ${total}\n  failed: 0\n  succeeded: ${total}\n  skipped: 0\n`

test('testTotal reads the last total of a Microsoft.Testing.Platform summary', () => {
  assert.equal(testTotal(`${summary(5)}\r\n${summary(78)}`), 78)
})

test('testTotal is null when the run printed no summary', () => {
  assert.equal(testTotal('No test projects were found.'), null)
})

test('ranTests returns the total of a passing run', () => {
  assert.equal(ranTests({ code: 0, output: summary(12) }, 'dotnet test'), 12)
})

test('ranTests rejects a run that exits 0 with zero tests', () => {
  assert.throws(() => ranTests({ code: 0, output: summary(0) }, 'dotnet test'), /exited 0 but reported 0 tests/)
})

test('ranTests rejects a run that exits 0 with no summary', () => {
  assert.throws(() => ranTests({ code: 0, output: '' }, 'dotnet test'), /reported no tests/)
})

test('ranTests rejects a failing run', () => {
  assert.throws(() => ranTests({ code: 8, output: summary(0) }, 'dotnet test'), /exit code 8/)
})

test('projectPath points at the csproj the way the skills pass it', () => {
  assert.equal(projectPath('Acme.Api.Tests'), 'backend/Acme.Api.Tests/Acme.Api.Tests.csproj')
})
