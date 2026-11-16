import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFixture } from '../../test-support/fixture.mjs'
import { Workspace } from '../../lib/workspace.mjs'
import { callTool } from '../../lib/tool.mjs'
import { tools as aTools } from '../../a/tools.mjs'
import { tools as bTools } from '../../b/tools.mjs'
import { tools as cTools } from '../../c/tools.mjs'

const MINUTES = 60 * 1000
const fixture = createFixture()
const workspace = new Workspace({ root: fixture.root })

const read = (file) => readFileSync(join(fixture.root, file), 'utf8')
const a = (name, input) => callTool(aTools.find((t) => t.name === name), workspace, input)
const b = (name, input) => callTool(bTools.find((t) => t.name === name), workspace, input)
const c = (code) => callTool(cTools[0], workspace, { code })

function at(file, needle, within = 0) {
  const text = read(file)
  const index = text.indexOf(needle) + within
  assert.ok(index >= within, `${needle} is in ${file}`)
  const before = text.slice(0, index)
  return { file, line: before.split('\n').length, character: index - before.lastIndexOf('\n') }
}

const timings = []
const timed = async (label, action) => {
  const started = performance.now()
  const result = await action()
  timings.push(`${label}: ${Math.round(performance.now() - started)} ms`)
  return result
}

after(async () => {
  console.log(`TIMINGS\n${timings.join('\n')}`)
  await workspace.stop()
  fixture.remove()
})

test('B find lists the overloads of a C# method with kind and path:line, by any suffix of the name path', { timeout: 10 * MINUTES }, async () => {
  const text = await timed('csharp find (cold start)', () => b('find', { name: 'Ordering.Order.Place' }))
  assert.match(text, /^2 matches\nOrdering\.Order\.Place \(Method\) backend\/Ordering\/Order\.cs:7\nOrdering\.Order\.Place \(Method\) backend\/Ordering\/Order\.cs:14$/)
  assert.equal(await b('find', { name: 'Place' }), text)
})

test('B find resolves a TypeScript folder scope and an exported name', { timeout: 5 * MINUTES }, async () => {
  const text = await timed('typescript find (cold start)', () => b('find', { name: 'entities/order:useOrder' }))
  assert.match(text, /^1 matches\nsrc\/entities\/order\/model\/use-order:useOrder \(Function\) src\/entities\/order\/model\/use-order\.ts:6$/)
  assert.match(await b('find', { name: 'order/model/use-order.ts:useOrder' }), /1 matches/)
})

test('B references: C# call sites are grouped by file with counts', { timeout: 5 * MINUTES }, async () => {
  const cold = await timed('csharp references (cold)', () => b('references', { name: 'Order.Count' }))
  const warm = await timed('csharp references (warm)', () => b('references', { name: 'Order.Count' }))
  assert.equal(cold, warm)
  assert.match(warm, /^2 references in 2 files\nbackend\/Ordering\/Order\.cs \(1\): 20\nbackend\/Ordering\/Pricing\.cs \(1\): 15$/)
})

test('B references: TypeScript sites across a barrel are grouped by file with counts', { timeout: 5 * MINUTES }, async () => {
  const cold = await timed('typescript references (cold)', () => b('references', { name: 'entities/order:useOrder' }))
  const warm = await timed('typescript references (warm)', () => b('references', { name: 'entities/order:useOrder' }))
  assert.equal(cold, warm)
  assert.match(warm, /^5 references in 3 files\nsrc\/entities\/order\/index\.ts \(1\): 1\nsrc\/entities\/order\/model\/use-order\.ts \(1\): 6\nsrc\/pages\/checkout\/ui\/summary\.ts \(3\): 1,4,9$/)
})

test('B refuses an ambiguous name and lists the candidates with path:line', { timeout: 5 * MINUTES }, async () => {
  await assert.rejects(b('references', { name: 'Pricing.Total' }), (error) => /^ambiguous: 2 symbols match "Pricing\.Total"/.test(error.message) && /Pricing\.cs:5/.test(error.message) && /Pricing\.cs:7/.test(error.message))
})

test('B callers, callees and implementations by name', { timeout: 5 * MINUTES }, async () => {
  assert.match(await b('callers', { name: 'Order.Count' }), /Checkout\.Run\(\) backend\/Ordering\/Pricing\.cs:12/)
  assert.match(await b('callees', { name: 'Checkout.Run' }), /Order\.Count\(\) backend\/Ordering\/Order\.cs:20/)
  assert.match(await b('implementations', { name: 'IShape.Area' }), /^backend\/Ordering\/Pricing\.cs:26$/)
  assert.match(await b('callers', { name: 'entities/order:orderTotal' }), /summarize src\/pages\/checkout\/ui\/summary\.ts:3\ntwice src\/pages\/checkout\/ui\/summary\.ts:8/)
})

test('A definition and references from a position, as an agent reads it in a file', { timeout: 5 * MINUTES }, async () => {
  const call = at('backend/Ordering/Pricing.cs', 'order.Count()', 7)
  assert.equal(await a('definition', call), 'backend/Ordering/Order.cs:20')
  assert.match(await a('references', call), /^2 references in 2 files\nbackend\/Ordering\/Order\.cs \(1\): 20\nbackend\/Ordering\/Pricing\.cs \(1\): 15$/)
  const used = at('src/pages/checkout/ui/summary.ts', 'useOrder(id)')
  assert.equal(await a('definition', used), 'src/entities/order/model/use-order.ts:6')
  assert.match(await a('references', at('src/entities/order/model/use-order.ts', 'useOrder')), /^5 references in 3 files/)
  assert.match(await a('callers', at('src/entities/order/model/use-order.ts', 'orderTotal')), /summarize/)
  assert.match(await a('symbols', { file: 'src/entities/order/model/use-order.ts' }), /Order Interface :1\n {2}id Property :2/)
})

test('C runs a snippet that calls ci.references and gets only what it prints', { timeout: 5 * MINUTES }, async () => {
  const text = await c('const text = await ci.references("Order.Count"); print(text.split("\\n")[0]); const m = await ci.matches("entities/order:useOrder"); return m.map((x) => x.path + ":" + x.line).join()')
  assert.equal(text, '2 references in 2 files\nsrc/entities/order/model/use-order.ts:6')
  assert.match(await c('return process.version'), /^error: process is not defined$/)
})

test('B diagnostics for a symbol, after replaceBody wrote a body that does not compile', { timeout: 5 * MINUTES }, async () => {
  assert.match(await b('diagnostics', { name: 'Order.Count' }), /: 0 in the symbol, \d+ in the file$/m)
  const replaced = await b('replaceBody', { name: 'Order.Count', body: 'return missing;' })
  assert.match(replaced, /replaced the block body of Ordering\.Order\.Count \(backend\/Ordering\/Order\.cs:20\); 1 errors in the file\nbackend\/Ordering\/Order\.cs:22 error /)
  assert.match(read('backend/Ordering/Order.cs'), /public int Count\(\)\n    \{\n        return missing;\n    \}/)
  const diagnostics = await b('diagnostics', { name: 'Order.Count' })
  assert.match(diagnostics, /: 1 in the symbol, \d+ in the file\nbackend\/Ordering\/Order\.cs:22 error/)
  await b('replaceBody', { name: 'Order.Count', body: 'return lines.Count;' })
  assert.match(await b('diagnostics', { name: 'Order.Count' }), /: 0 in the symbol/)
})

test('B replaceBody on a TypeScript function and an expression-bodied C# method', { timeout: 5 * MINUTES }, async () => {
  const text = await b('replaceBody', { name: 'entities/order:useOrder', body: 'const total = id.length\nreturn { id, total }' })
  assert.match(text, /^replaced the block body of .*use-order:useOrder .*; 0 errors in the file$/)
  assert.match(read('src/entities/order/model/use-order.ts'), /export function useOrder\(id: string\): Order \{\n {2}const total = id\.length\n {2}return \{ id, total \}\n\}/)
  assert.match(await b('replaceBody', { name: 'Square.Area', body: 'side * side * 1.0' }), /expression body of Ordering\.Square\.Area/)
  assert.match(read('backend/Ordering/Pricing.cs'), /public double Area\(\) => side \* side \* 1\.0;/)
})

test('B rename: all overloads and every call site in C#, every site across the barrel in TypeScript', { timeout: 5 * MINUTES }, async () => {
  const csharp = await b('rename', { name: 'Pricing.Total', newName: 'Sum' })
  assert.match(csharp, /^renamed Ordering\.Pricing\.Total to Sum, 2 overloads: \d+ edits in 2 files\nbackend\/Ordering\/Order\.cs\nbackend\/Ordering\/Pricing\.cs$/)
  assert.doesNotMatch(read('backend/Ordering/Pricing.cs') + read('backend/Ordering/Order.cs'), /Total\(/)
  assert.match(read('backend/Ordering/Pricing.cs'), /Sum\(int quantity, decimal unit\)[\s\S]*Sum\(decimal amount\) => Sum\(1, amount\)[\s\S]*Pricing\.Sum\(2, 1m\)/)
  const typescript = await b('rename', { name: 'entities/order:orderTotal', newName: 'totalOf' })
  assert.match(typescript, /^renamed .*orderTotal to totalOf: 5 edits in 3 files/)
  assert.match(read('src/pages/checkout/ui/summary.ts'), /totalOf\(order\)[\s\S]*totalOf\(useOrder\(id\)\)/)
  assert.doesNotMatch(read('src/pages/checkout/ui/summary.ts') + read('src/entities/order/index.ts'), /orderTotal/)
  assert.match(await b('references', { name: 'Pricing.Sum' }).catch((e) => e.message), /ambiguous/)
  assert.match(await a('diagnostics', { file: 'src/pages/checkout/ui/summary.ts' }), /^no diagnostics$/)
})
