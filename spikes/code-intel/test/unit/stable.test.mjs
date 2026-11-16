import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { untilStable } from '../../lib/stable.mjs'
import { Workspace } from '../../lib/workspace.mjs'
import { fakeSession } from '../../test-support/fake-session.mjs'

const instant = async () => {}

test('the wait ends when two consecutive counts match', async () => {
  const counts = [0, 2, 5, 5, 9]
  let calls = 0
  const result = await untilStable(async () => Array(counts[calls++]).fill(1), { sleep: instant })
  assert.equal(result.value.length, 5)
  assert.equal(result.attempts, 4)
  assert.equal(result.stable, true)
})

test('the wait is bounded and reports that the count never settled', async () => {
  let calls = 0
  const result = await untilStable(async () => Array(calls++).fill(1), { attempts: 5, sleep: instant })
  assert.equal(result.attempts, 5)
  assert.equal(result.stable, false)
})

test('workspace references are re-queried until the count is stable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-stable-'))
  writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
  const session = fakeSession(root, { 'textDocument/references': (_, n) => answers[Math.min(n, answers.length) - 1] })
  const at = (line) => ({ uri: session.uri('a.ts'), range: { start: { line, character: 0 }, end: { line, character: 1 } } })
  const answers = [[at(0)], [at(0), at(1)], [at(0), at(1), at(2)], [at(0), at(1), at(2)]]
  const workspace = new Workspace({ root, start: async () => session, referenceDelayMs: 0 })
  try {
    const result = await workspace.references('a.ts', 1, 1)
    assert.equal(result.locations.length, 3)
    assert.equal(result.attempts, 4)
    assert.equal(result.stable, true)
    assert.deepEqual(result.locations[2], { path: 'a.ts', line: 3, character: 1 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a file changed on disk is sent to the server again before the next request, an unchanged one is not', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-fresh-'))
  writeFileSync(join(root, 'a.ts'), 'one\n')
  writeFileSync(join(root, 'b.ts'), 'other\n')
  const session = fakeSession(root, { 'textDocument/definition': [] })
  const workspace = new Workspace({ root, start: async () => session })
  try {
    await workspace.definition('b.ts', 1, 1)
    await workspace.definition('a.ts', 1, 1)
    await workspace.definition('a.ts', 1, 1)
    writeFileSync(join(root, 'a.ts'), 'two\n')
    await workspace.definition('a.ts', 1, 1)
    const sent = session.calls.filter((c) => c[0] === 'open' || c[0] === 'resync').map((c) => [c[0], c[2]])
    assert.deepEqual(sent.filter(([, text]) => text.startsWith('one') || text.startsWith('two')), [['open', 'one\n'], ['resync', 'two\n']])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a file outside the project root or of an unknown language is refused', async () => {
  const workspace = new Workspace({ root: tmpdir(), start: async () => assert.fail('no server should start') })
  await assert.rejects(workspace.definition('../elsewhere.ts', 1, 1), /outside the project root/)
  await assert.rejects(workspace.definition('notes.md', 1, 1), /no language server for \.md/)
})
