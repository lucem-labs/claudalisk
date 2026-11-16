import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSnippet } from '../../c/sandbox.mjs'
import { CI_OPS, CI_READ_OPS, bridge, readTools, tools } from '../../c/tools.mjs'

const call = async (op, args) => (op === 'matches' ? [{ qualified: 'A.B', path: 'a.cs', line: 3 }] : `${op}:${args.join(',')}`)
const run = (code, extra = {}) => runSnippet(code, { call, ops: ['find', 'matches', 'boom'], timeoutMs: 20000, ...extra })

test('what the snippet prints and returns comes back, and ci calls reach the host as plain data', async () => {
  assert.equal(await run('print("a", {b: 1}); const m = await ci.matches("x"); print(m[0].path); return await ci.find("A.B", 2)'), 'a {"b":1}\na.cs\nfind:A.B,2')
})

test('a snippet that prints and returns nothing answers ok', async () => {
  assert.equal(await run('const x = 1'), 'ok')
})

test('process and require do not exist', async () => {
  assert.equal(await run('return typeof process + "," + typeof require + "," + typeof module + "," + typeof Buffer + "," + typeof setTimeout + "," + typeof fetch'), 'undefined,undefined,undefined,undefined,undefined,undefined')
  assert.match(await run('return process.env'), /error: process is not defined/)
  assert.match(await run('return require("node:fs").readdirSync(".")'), /error: require is not defined/)
})

test('dynamic import is refused', async () => {
  assert.match(await run('return await import("node:fs")'), /^error: /)
  assert.match(await run('const fs = await import("node:fs"); return fs.readdirSync(".")'), /^error: /)
})

test('reaching the real Function constructor through the global object is refused', async () => {
  assert.match(await run('return globalThis.constructor.constructor("return process")()'), /error: Code generation from strings disallowed/)
  assert.match(await run('return (function () {}).constructor("return process")()'), /error: Code generation from strings disallowed/)
  assert.match(await run('return eval("process")'), /error: Code generation from strings disallowed/)
  assert.match(await run('return new Function("return process")()'), /error: Code generation from strings disallowed/)
})

test('nothing a host call returns or throws leads back to the host realm', async () => {
  const code = 'const m = await ci.matches("x"); return m.constructor.constructor("return process")()'
  assert.match(await run(code), /error: Code generation from strings disallowed/)
  assert.match(await run('return ci.find.constructor("return process")()'), /error: Code generation from strings disallowed/)
  const thrown = await run('try { await ci.boom() } catch (e) { return e.constructor.constructor("return process")() }', { call: async () => { throw new Error('nope') } })
  assert.match(thrown, /error: Code generation from strings disallowed/)
  assert.match(await run('try { await ci.boom() } catch (e) { return "caught " + e.message }', { call: async () => { throw new Error('nope') } }), /caught nope/)
})

test('webassembly cannot compile code either', async () => {
  assert.match(await run('return typeof WebAssembly === "undefined" ? "none" : String(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])))'), /^(none|error: )/)
})

test('an infinite loop is stopped at the time limit', async () => {
  const started = Date.now()
  assert.match(await run('while (true) {}', { timeoutMs: 600 }), /error: time limit of 600 ms reached/)
  assert.ok(Date.now() - started < 10000)
})

test('an infinite loop after an await is stopped too, and output printed before it is kept', async () => {
  const text = await run('print("before"); await ci.find("x"); for (;;) {}', { timeoutMs: 800 })
  assert.match(text, /^before\nerror: time limit of 800 ms reached$/)
})

test('a host call that never answers is cut at the time limit', async () => {
  assert.match(await run('await ci.find("x")', { timeoutMs: 400, call: () => new Promise(() => {}) }), /time limit/)
})

test('output is cut at the cap', async () => {
  const text = await run('for (let i = 0; i < 2000; i++) print("line " + i)', { cap: 500 })
  assert.ok(text.length < 600)
  assert.match(text, /\.\.\. truncated, \d+ more characters$/)
})

test('a syntax error or a thrown error is reported, not thrown', async () => {
  assert.match(await run('return +'), /^error: /)
  assert.equal(await run('throw new Error("bad")'), 'error: bad')
})

test('the run tool exposes the symbol operations and reaches the workspace through the bridge', async () => {
  const workspace = { workspaceSymbols: async () => [], documentSymbols: async () => [] }
  const reply = await bridge(workspace)('matches', ['Nothing'])
  assert.deepEqual(reply, [])
  await assert.rejects(bridge(workspace)('unknown', []), /unknown operation/)
  assert.equal(tools.length, 1)
  const text = await tools[0].run(workspace, { code: 'print((await ci.matches("Nothing")).length); try { await ci.references("Nothing") } catch (e) { print(e.message) }' })
  assert.equal(text, '0\nno symbol matches "Nothing" (write Namespace.Type.Member, any trailing part)')
})

test('the read-only run tool has no edit operations, in its description, its ops and its bridge', async () => {
  const workspace = { workspaceSymbols: async () => [], documentSymbols: async () => [] }
  assert.equal(readTools.length, 1)
  assert.equal(readTools[0].name, 'run')
  assert.deepEqual(readTools[0].annotations, { readOnlyHint: true })
  assert.deepEqual(tools[0].annotations, { readOnlyHint: false })
  assert.equal(CI_READ_OPS.includes('rename'), false)
  assert.equal(CI_READ_OPS.includes('replaceBody'), false)
  assert.equal(CI_READ_OPS.includes('find'), true)
  assert.equal(CI_OPS.includes('rename'), true)
  assert.equal(/rename|replaceBody/.test(readTools[0].description), false)
  await assert.rejects(bridge(workspace, CI_READ_OPS)('rename', ['X', 'Y']), /unknown operation rename/)
  const text = await readTools[0].run(workspace, { code: 'print(typeof ci.rename, typeof ci.replaceBody, typeof ci.find)' })
  assert.equal(text, 'undefined undefined function')
})

test('every tool of every interface says whether it is read-only, and only the edits are not', async () => {
  const { tools: a } = await import('../../a/tools.mjs')
  const { tools: b } = await import('../../b/tools.mjs')
  const editing = (list) => list.filter((tool) => tool.annotations.readOnlyHint === false).map((tool) => tool.name)
  for (const list of [a, b, tools, readTools]) for (const tool of list) assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', tool.name)
  assert.deepEqual(editing(a), ['rename'])
  assert.deepEqual(editing(b), ['rename', 'replaceBody'])
  assert.deepEqual(editing(tools), ['run'])
  assert.deepEqual(editing(readTools), [])
})
