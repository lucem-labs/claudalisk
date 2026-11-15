import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keyOf, uriOf } from './lib/edits.mjs'
import { Session } from './lib/session.mjs'
import { SERVERS } from './lib/servers.mjs'
import { clientCapabilities } from './lib/protocol.mjs'

const here = dirname(fileURLToPath(import.meta.url))

function attached(files) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'lsp-host-session-')))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content)
  const session = new Session(root).attach({ client: { notify: () => {} }, name: 'fake', definition: { languageId: 'plain' }, initialize: { capabilities: {} } })
  return { root, session, done: () => rmSync(root, { recursive: true, force: true }) }
}

const replaceAll = (uri, version, newText) => ({ documentChanges: [{ textDocument: { uri, version }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText }] }] })

test('documents are identified by path, so an encoded form of the same URI finds the open document and its version', () => {
  const { root, session, done } = attached({ 'a.txt': 'hello' })
  try {
    const uri = session.open('a.txt')
    const encoded = uri.replace('a.txt', '%61.txt')
    assert.notEqual(encoded, uri)
    assert.equal(session.versionOf(encoded), 1)
    assert.ok(session.isOpen(encoded))
    session.apply(replaceAll(encoded, 1, 'bye'))
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'bye')
    assert.equal(session.versionOf(uri), 2)
    session.close('a.txt')
    assert.equal(session.isOpen(encoded), false)
  } finally {
    done()
  }
})

test('keys ignore the drive letter case and its encoding on Windows and macOS, and keep case on Linux', () => {
  assert.equal(keyOf('file:///C:/Work/a.cs', 'win32'), keyOf('file:///c%3A/work/A.cs', 'win32'))
  assert.equal(keyOf('file:///C:/Work/a.cs', 'darwin'), keyOf('file:///C:/work/A.cs', 'darwin'))
  assert.notEqual(keyOf('file:///C:/Work/a.cs', 'linux'), keyOf('file:///C:/work/a.cs', 'linux'))
  assert.equal(keyOf('untitled:Untitled-1'), 'untitled:Untitled-1')
})

test('an applyEdit that changes nothing is applied but not effective, and a refused one is recorded as refused', () => {
  const { session, root, done } = attached({ 'a.txt': 'hello' })
  try {
    const uri = uriOf(join(root, 'a.txt'))
    assert.deepEqual(session.serverApplyEdit({ edit: replaceAll(uri, null, 'hello') }), { applied: true })
    assert.equal(session.serverApplyEdit({ edit: replaceAll(uri, 7, 'bye') }).applied, false)
    assert.deepEqual(session.serverApplyEdit({ edit: replaceAll(uri, null, 'bye') }), { applied: true })
    assert.deepEqual(session.serverEdits.map((e) => [e.applied, e.effective]), [[true, false], [false, false], [true, true]])
    assert.match(session.serverEdits[1].failureReason, /not open/)
  } finally {
    done()
  }
})

test('a resource operation counts as an effect even when no text changed', () => {
  const { session, root, done } = attached({ 'a.txt': 'hello' })
  try {
    const result = session.serverApplyEdit({ edit: { documentChanges: [{ kind: 'rename', oldUri: uriOf(join(root, 'a.txt')), newUri: uriOf(join(root, 'b.txt')) }] } })
    assert.equal(result.applied, true)
    assert.equal(session.serverEdits[0].effective, true)
  } finally {
    done()
  }
})

test('the client leaves textDocument.diagnostic out when asked not to advertise pull', () => {
  assert.ok(clientCapabilities().textDocument.diagnostic)
  assert.equal(clientCapabilities({ pullDiagnostics: false }).textDocument.diagnostic, undefined)
})

test('a server request sent before initialize is answered is handled by the session', async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'lsp-host-early-')))
  writeFileSync(join(root, 'early.txt'), 'hello')
  SERVERS['early-edit'] = {
    language: 'plain',
    languageId: 'plain',
    prepare: () => ({ spec: { command: process.execPath, args: [join(here, 'test-support', 'early-edit-server.mjs')], cwd: here } }),
    async afterInitialize() {},
    async waitUntilLoaded() {},
  }
  let session
  try {
    session = await Session.start('early-edit', root)
    assert.deepEqual(session.capabilities.experimental.applyResult, { applied: true })
    assert.equal(readFileSync(join(root, 'early.txt'), 'utf8'), 'bye')
    assert.equal(session.serverEdits.length, 1)
  } finally {
    await session?.stop().catch(() => session.client.child?.kill())
    delete SERVERS['early-edit']
    rmSync(root, { recursive: true, force: true })
  }
})
