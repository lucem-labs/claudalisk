import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOverloadGroup, resolveName, resolveOne } from '../../lib/symbols.mjs'
import { renameByName, find } from '../../b/tools.mjs'

const at = (line, character = 0) => ({ start: { line, character }, end: { line, character: character + 3 } })

function fakeWorkspace({ symbols, documents }) {
  const edits = []
  return {
    edits,
    workspaceSymbols: async () => symbols,
    documentSymbols: async (path) => documents[path] ?? [],
    renameEdit: async (path, line, character, newName) => {
      edits.push([path, line, character, newName])
      return { session: 'S', edit: { documentChanges: [{ textDocument: { uri: `file:///${path}`, version: null }, edits: [{ range: at(line - 1, character - 1), newText: newName }] }] } }
    },
    applyEdit: async (session, edit) => ({ files: edit.documentChanges.map((c) => c.textDocument.uri.slice(8)), edits: edit.documentChanges.length }),
  }
}

const place = (line, path = 'Order.cs') => ({ name: 'Place', kind: 6, path, range: at(line) })
const declared = (line, ...chain) => ({ name: 'Place', kind: 6, chain, depth: 2, line: line + 1, range: { start: at(line).start, end: at(line + 3).end }, selectionRange: at(line) })

test('a unique name resolves to its declaration with the qualified chain from the outline', async () => {
  const ws = fakeWorkspace({ symbols: [place(6)], documents: { 'Order.cs': [declared(6, 'Ordering', 'Order', 'Place')] } })
  const { candidate } = await resolveOne(ws, 'Order.Place')
  assert.equal(candidate.qualified, 'Ordering.Order.Place')
  assert.equal(candidate.line, 7)
})

test('a name that matches several symbols is refused and the candidates are listed', async () => {
  const ws = fakeWorkspace({ symbols: [place(6), place(13)], documents: { 'Order.cs': [declared(6, 'Ordering', 'Order', 'Place'), declared(13, 'Ordering', 'Order', 'Place')] } })
  await assert.rejects(resolveOne(ws, 'Place'), (error) => /^ambiguous: 2 symbols match "Place"/.test(error.message) && /Order\.cs:7/.test(error.message) && /Order\.cs:14/.test(error.message))
})

test('a longer name path narrows the candidates down to one', async () => {
  const ws = fakeWorkspace({ symbols: [place(6, 'Order.cs'), place(2, 'Cart.cs')], documents: { 'Order.cs': [declared(6, 'Ordering', 'Order', 'Place')], 'Cart.cs': [declared(2, 'Ordering', 'Cart', 'Place')] } })
  const { candidates } = await resolveName(ws, 'Place')
  assert.equal(candidates.length, 2)
  const { candidate } = await resolveOne(ws, 'Cart.Place')
  assert.equal(candidate.path, 'Cart.cs')
})

test('an unknown name says what shape a name path has', async () => {
  const ws = fakeWorkspace({ symbols: [], documents: {} })
  await assert.rejects(find(ws, 'Nothing.Here'), /no symbol matches "Nothing.Here"/)
  await assert.rejects(find(ws, 'a/b:c'), /folder\/or\/file:exportedName/)
})

test('only exact names count, so a substring hit from the server is ignored', async () => {
  const ws = fakeWorkspace({ symbols: [{ ...place(6), name: 'PlaceAll' }], documents: {} })
  assert.equal((await resolveName(ws, 'Place')).candidates.length, 0)
})

test('overloads of one method are renamed together, other ambiguity is still refused', async () => {
  const symbols = [place(6), place(13)]
  const documents = { 'Order.cs': [declared(6, 'Ordering', 'Order', 'Place'), declared(13, 'Ordering', 'Order', 'Place')] }
  const ws = fakeWorkspace({ symbols, documents })
  const text = await renameByName(ws, 'Order.Place', 'Put')
  assert.deepEqual(ws.edits.map((e) => e.slice(0, 3)), [['Order.cs', 7, 1], ['Order.cs', 14, 1]])
  assert.match(text, /^renamed Ordering\.Order\.Place to Put, 2 overloads/)
  const mixed = fakeWorkspace({ symbols: [place(6, 'Order.cs'), place(2, 'Cart.cs')], documents: { 'Order.cs': [declared(6, 'Ordering', 'Order', 'Place')], 'Cart.cs': [declared(2, 'Ordering', 'Cart', 'Place')] } })
  await assert.rejects(renameByName(mixed, 'Place', 'Put'), /ambiguous/)
  assert.equal(mixed.edits.length, 0)
  assert.ok(isOverloadGroup((await resolveName(ws, 'Order.Place')).candidates))
})

test('a type and its constructor share a name, and the type is the one a bare type name means', async () => {
  const type = { name: 'Order', kind: 5, path: 'Order.cs', range: at(2) }
  const constructor = { name: 'Order', kind: 9, path: 'Order.cs', range: at(4) }
  const documents = { 'Order.cs': [{ ...declared(2, 'Bench', 'Ordering', 'Order'), name: 'Order' }, { ...declared(4, 'Bench', 'Ordering', 'Order', 'Order'), name: 'Order' }] }
  const ws = fakeWorkspace({ symbols: [type, constructor], documents })

  assert.equal((await resolveName(ws, 'Ordering.Order')).candidates.length, 2)
  assert.deepEqual((await resolveOne(ws, 'Ordering.Order')).candidate.chain, ['Bench', 'Ordering', 'Order'])
  assert.deepEqual((await resolveOne(ws, 'Order.Order')).candidate.chain, ['Bench', 'Ordering', 'Order', 'Order'])
})
