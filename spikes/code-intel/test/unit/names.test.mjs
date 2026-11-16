import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chainOfSymbolPath, matches, parseName, qualified, stripSignature } from '../../lib/names.mjs'

test('a C# name path is split on dots and searched by its last segment', () => {
  const parsed = parseName('Ordering.Order.Place')
  assert.deepEqual(parsed, { language: 'csharp', scope: [], member: ['Ordering', 'Order', 'Place'], query: 'Place' })
})

test('a TypeScript name path has a folder or file scope, a colon and an exported name', () => {
  assert.deepEqual(parseName('entities/order:useOrder'), { language: 'typescript', scope: ['entities', 'order'], member: ['useOrder'], query: 'useOrder' })
  assert.deepEqual(parseName('entities\\order\\model\\use-order.ts:Order.total').scope, ['entities', 'order', 'model', 'use-order'])
  assert.equal(parseName('a/b:Class.method').query, 'method')
})

test('empty or half written names are refused with a hint', () => {
  assert.throws(() => parseName('  '), /empty name/)
  assert.throws(() => parseName('entities/order:'), /folder\/or\/file:exportedName/)
  assert.throws(() => parseName(':useOrder'), /folder\/or\/file:exportedName/)
})

test('signatures are stripped from symbol names and dotted namespaces become segments', () => {
  assert.equal(stripSignature('Total(int, decimal) : decimal'), 'Total')
  assert.equal(stripSignature('List<T>'), 'List')
  assert.deepEqual(chainOfSymbolPath(['Acme.Ordering', 'Order', 'Place(int) : decimal']), ['Acme', 'Ordering', 'Order', 'Place'])
})

test('a C# name matches when it ends like the symbol chain and its earlier parts appear in order, so a module name skips the layer namespaces', () => {
  const candidate = { chain: ['Acme', 'Ordering', 'Order', 'Place'], path: 'a.cs' }
  assert.ok(matches(parseName('Place'), candidate))
  assert.ok(matches(parseName('Order.Place'), candidate))
  assert.ok(matches(parseName('Ordering.Order.Place'), candidate))
  assert.ok(!matches(parseName('Orders.Place'), candidate))
  assert.ok(!matches(parseName('Ordering.Order'), candidate))
  const layered = { chain: ['Bench', 'Modules', 'Ordering', 'Domain', 'Order'], path: 'a.cs' }
  assert.ok(matches(parseName('Ordering.Order'), layered))
  assert.ok(matches(parseName('Modules.Domain.Order'), layered))
  assert.ok(!matches(parseName('Domain.Ordering.Order'), layered))
  assert.ok(!matches(parseName('Billing.Order'), layered))
})

test('a TypeScript scope must appear as consecutive folders or the file name in the path', () => {
  const candidate = { chain: ['useOrder'], path: 'src/entities/order/model/use-order.ts' }
  assert.ok(matches(parseName('entities/order:useOrder'), candidate))
  assert.ok(matches(parseName('order/model/use-order.ts:useOrder'), candidate))
  assert.ok(matches(parseName('use-order:useOrder'), candidate))
  assert.ok(!matches(parseName('entities/model:useOrder'), candidate))
  assert.ok(!matches(parseName('entities/order:orderTotal'), candidate))
})

test('the qualified display is a name path that can be pasted back', () => {
  const candidate = { chain: ['Ordering', 'Order', 'Place'], path: 'a.cs' }
  assert.equal(qualified(parseName('Place'), candidate), 'Ordering.Order.Place')
  assert.equal(qualified(parseName('x/y:f'), { chain: ['f'], path: 'src/x/y.ts' }), 'src/x/y:f')
})
