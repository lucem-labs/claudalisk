import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyTextEdits, applyWorkspaceEdit, EditRefused, hasEffect, keyOf, uriOf } from './lib/edits.mjs'

function workspace(files) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'lsp-host-edits-')))
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return { root, uri: (name) => uriOf(join(root, name)), read: (name) => readFileSync(join(root, name), 'utf8'), done: () => rmSync(root, { recursive: true, force: true }) }
}

const BOM = String.fromCharCode(0xfeff)
const edit = (line, from, to, newText) => ({ range: { start: { line, character: from }, end: { line, character: to } }, newText })

function refused(code, action) {
  assert.throws(action, (error) => error instanceof EditRefused && error.code === code, `expected a refusal with code ${code}`)
}

test('positions count UTF-16 code units, so a character outside the basic plane takes two', () => {
  assert.equal(applyTextEdits('a😀b\n', [edit(0, 3, 4, 'X')]), 'a😀X\n')
  assert.equal(applyTextEdits('a😀b\n', [edit(0, 1, 3, '')]), 'ab\n')
})

test('edits in one document apply from the end to the start, so earlier positions stay valid', () => {
  assert.equal(applyTextEdits('one two three', [edit(0, 0, 3, 'uno'), edit(0, 8, 13, 'tres'), edit(0, 4, 7, 'dos')]), 'uno dos tres')
})

test('inserts at the same position keep the order they were sent in', () => {
  assert.equal(applyTextEdits('ac', [edit(0, 1, 1, 'b'), edit(0, 1, 1, 'B')]), 'abBc')
})

test('overlapping edits are refused', () => {
  refused('overlap', () => applyTextEdits('abcdef', [edit(0, 0, 4, 'x'), edit(0, 2, 5, 'y')]))
})

test('edits that touch end to start do not overlap', () => {
  assert.equal(applyTextEdits('abcdef', [edit(0, 0, 3, 'x'), edit(0, 3, 6, 'y')]), 'xy')
})

test('a character past the end of the line is clamped, a line past the end is refused', () => {
  assert.equal(applyTextEdits('ab\ncd', [edit(0, 99, 99, '!')]), 'ab!\ncd')
  refused('bad-position', () => applyTextEdits('ab', [edit(3, 0, 3, 'x')]))
})

test('line endings are kept as found, and inserted text takes the document ending', () => {
  assert.equal(applyTextEdits('a\r\nb\r\nc\r\n', [edit(1, 0, 1, 'x\ny')]), 'a\r\nx\r\ny\r\nc\r\n')
  assert.equal(applyTextEdits('a\nb\n', [edit(0, 0, 1, 'x\r\ny')]), 'x\ny\nb\n')
})

test('a byte order mark is kept and does not count as a character', () => {
  assert.equal(applyTextEdits(`${BOM}ab`, [edit(0, 0, 1, 'X')]), `${BOM}Xb`)
})

test('changes and documentChanges are both applied to disk', () => {
  const w = workspace({ 'a.txt': 'hello', 'b.txt': 'world' })
  try {
    applyWorkspaceEdit({ changes: { [w.uri('a.txt')]: [edit(0, 0, 5, 'HELLO')] } }, { root: w.root })
    applyWorkspaceEdit({ documentChanges: [{ textDocument: { uri: w.uri('b.txt'), version: null }, edits: [edit(0, 0, 5, 'WORLD')] }] }, { root: w.root })
    assert.equal(w.read('a.txt'), 'HELLO')
    assert.equal(w.read('b.txt'), 'WORLD')
  } finally {
    w.done()
  }
})

test('an edit outside the workspace root is refused and nothing is written', () => {
  const w = workspace({ 'a.txt': 'hello' })
  const outside = workspace({ 'x.txt': 'secret' })
  try {
    refused('outside-root', () =>
      applyWorkspaceEdit(
        { documentChanges: [{ textDocument: { uri: w.uri('a.txt'), version: null }, edits: [edit(0, 0, 5, 'changed')] }, { textDocument: { uri: outside.uri('x.txt'), version: null }, edits: [edit(0, 0, 6, 'changed')] }] },
        { root: w.root },
      ),
    )
    assert.equal(w.read('a.txt'), 'hello')
    assert.equal(outside.read('x.txt'), 'secret')
  } finally {
    w.done()
    outside.done()
  }
})

test('a parent folder reference that leaves the root is refused', () => {
  const w = workspace({ 'a.txt': 'hello' })
  try {
    refused('outside-root', () => applyWorkspaceEdit({ documentChanges: [{ kind: 'create', uri: `${w.uri('a.txt')}/../../escape.txt` }] }, { root: w.root }))
  } finally {
    w.done()
  }
})

test('a version that does not match the open document is refused, a matching one is applied', () => {
  const w = workspace({ 'a.txt': 'hello' })
  try {
    const open = new Map([[keyOf(w.uri('a.txt')), 3]])
    const change = (version) => ({ documentChanges: [{ textDocument: { uri: w.uri('a.txt'), version }, edits: [edit(0, 0, 5, 'bye')] }] })
    refused('version', () => applyWorkspaceEdit(change(2), { root: w.root, openDocuments: open }))
    refused('version', () => applyWorkspaceEdit(change(1), { root: w.root, openDocuments: new Map() }))
    assert.equal(w.read('a.txt'), 'hello')
    applyWorkspaceEdit(change(3), { root: w.root, openDocuments: open })
    assert.equal(w.read('a.txt'), 'bye')
  } finally {
    w.done()
  }
})

test('overlapping edits refuse the whole workspace edit, including the files that were fine', () => {
  const w = workspace({ 'a.txt': 'hello', 'b.txt': 'abcdef' })
  try {
    refused('overlap', () =>
      applyWorkspaceEdit(
        { documentChanges: [{ textDocument: { uri: w.uri('a.txt'), version: null }, edits: [edit(0, 0, 5, 'x')] }, { textDocument: { uri: w.uri('b.txt'), version: null }, edits: [edit(0, 0, 4, 'x'), edit(0, 3, 5, 'y')] }] },
        { root: w.root },
      ),
    )
    assert.equal(w.read('a.txt'), 'hello')
  } finally {
    w.done()
  }
})

test('a rename onto an existing file without overwrite is refused and both files stay', () => {
  const w = workspace({ 'a.txt': 'A', 'b.txt': 'B' })
  try {
    refused('exists', () => applyWorkspaceEdit({ documentChanges: [{ kind: 'rename', oldUri: w.uri('a.txt'), newUri: w.uri('b.txt') }] }, { root: w.root }))
    assert.equal(w.read('a.txt'), 'A')
    assert.equal(w.read('b.txt'), 'B')
    applyWorkspaceEdit({ documentChanges: [{ kind: 'rename', oldUri: w.uri('a.txt'), newUri: w.uri('b.txt'), options: { overwrite: true } }] }, { root: w.root })
    assert.equal(existsSync(join(w.root, 'a.txt')), false)
    assert.equal(w.read('b.txt'), 'A')
  } finally {
    w.done()
  }
})

test('a rename with ignoreIfExists leaves both files alone', () => {
  const w = workspace({ 'a.txt': 'A', 'b.txt': 'B' })
  try {
    applyWorkspaceEdit({ documentChanges: [{ kind: 'rename', oldUri: w.uri('a.txt'), newUri: w.uri('b.txt'), options: { ignoreIfExists: true } }] }, { root: w.root })
    assert.equal(w.read('a.txt'), 'A')
    assert.equal(w.read('b.txt'), 'B')
  } finally {
    w.done()
  }
})

test('a rename moves the file into a new folder and an edit after it sees the new path', () => {
  const w = workspace({ 'a.txt': 'hello' })
  try {
    applyWorkspaceEdit(
      { documentChanges: [{ kind: 'rename', oldUri: w.uri('a.txt'), newUri: w.uri('sub/b.txt') }, { textDocument: { uri: w.uri('sub/b.txt'), version: null }, edits: [edit(0, 0, 5, 'moved')] }] },
      { root: w.root },
    )
    assert.equal(existsSync(join(w.root, 'a.txt')), false)
    assert.equal(w.read('sub/b.txt'), 'moved')
  } finally {
    w.done()
  }
})

test('create honours overwrite and ignoreIfExists, and an existing file is otherwise refused', () => {
  const w = workspace({ 'a.txt': 'keep' })
  try {
    refused('exists', () => applyWorkspaceEdit({ documentChanges: [{ kind: 'create', uri: w.uri('a.txt') }] }, { root: w.root }))
    applyWorkspaceEdit({ documentChanges: [{ kind: 'create', uri: w.uri('a.txt'), options: { ignoreIfExists: true } }] }, { root: w.root })
    assert.equal(w.read('a.txt'), 'keep')
    applyWorkspaceEdit({ documentChanges: [{ kind: 'create', uri: w.uri('a.txt'), options: { overwrite: true } }] }, { root: w.root })
    assert.equal(w.read('a.txt'), '')
    applyWorkspaceEdit({ documentChanges: [{ kind: 'create', uri: w.uri('new/c.txt') }, { textDocument: { uri: w.uri('new/c.txt'), version: null }, edits: [edit(0, 0, 0, 'text')] }] }, { root: w.root })
    assert.equal(w.read('new/c.txt'), 'text')
  } finally {
    w.done()
  }
})

test('delete removes a file, refuses a missing one unless ignoreIfNotExists is set', () => {
  const w = workspace({ 'a.txt': 'A' })
  try {
    applyWorkspaceEdit({ documentChanges: [{ kind: 'delete', uri: w.uri('a.txt') }] }, { root: w.root })
    assert.equal(existsSync(join(w.root, 'a.txt')), false)
    refused('missing', () => applyWorkspaceEdit({ documentChanges: [{ kind: 'delete', uri: w.uri('a.txt') }] }, { root: w.root }))
    applyWorkspaceEdit({ documentChanges: [{ kind: 'delete', uri: w.uri('a.txt'), options: { ignoreIfNotExists: true } }] }, { root: w.root })
  } finally {
    w.done()
  }
})

test('a URI that is not a file, such as a generated document, is refused', () => {
  const w = workspace({})
  try {
    refused('not-a-file', () => applyWorkspaceEdit({ changes: { 'roslyn-source-generated://x/Y.cs': [edit(0, 0, 0, 'x')] } }, { root: w.root }))
  } finally {
    w.done()
  }
})

test('the version check finds the document under another spelling of its URI', () => {
  const w = workspace({ 'a.txt': 'hello' })
  try {
    const open = new Map([[keyOf(w.uri('a.txt')), 3]])
    const spelled = w.uri('a.txt').replace('a.txt', '%61.txt')
    applyWorkspaceEdit({ documentChanges: [{ textDocument: { uri: spelled, version: 3 }, edits: [edit(0, 0, 5, 'bye')] }] }, { root: w.root, openDocuments: open })
    assert.equal(w.read('a.txt'), 'bye')
  } finally {
    w.done()
  }
})

test('an edit that rewrites text to itself has no effect, and a create, rename or delete always has one', () => {
  const w = workspace({ 'a.txt': 'hello' })
  try {
    const same = applyWorkspaceEdit({ documentChanges: [{ textDocument: { uri: w.uri('a.txt'), version: null }, edits: [edit(0, 0, 5, 'hello')] }] }, { root: w.root })
    assert.equal(hasEffect(same), false)
    assert.equal(hasEffect([]), false)
    const created = applyWorkspaceEdit({ documentChanges: [{ kind: 'create', uri: w.uri('c.txt') }] }, { root: w.root })
    assert.equal(hasEffect(created), true)
    const renamed = applyWorkspaceEdit({ documentChanges: [{ kind: 'rename', oldUri: w.uri('c.txt'), newUri: w.uri('d.txt') }] }, { root: w.root })
    assert.equal(hasEffect(renamed), true)
    const changed = applyWorkspaceEdit({ documentChanges: [{ textDocument: { uri: w.uri('a.txt'), version: null }, edits: [edit(0, 0, 5, 'bye')] }] }, { root: w.root })
    assert.equal(hasEffect(changed), true)
  } finally {
    w.done()
  }
})
