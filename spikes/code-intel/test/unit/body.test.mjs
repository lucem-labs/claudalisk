import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findBody, lineStarts, offsetOf, positionOf, renderBlock, replaceBodyText } from '../../lib/body.mjs'
import { mergeEdits, countEdits } from '../../lib/merge.mjs'

const csharp = `namespace N;

public class C
{
    public int Count()
    {
        return lines.Count;
    }

    public int Twice(int x) => x * 2;
}
`

const range = (startLine, endLine, endCharacter) => ({ start: { line: startLine, character: 4 }, end: { line: endLine, character: endCharacter } })

test('a block body is found after the signature, past braces in strings and comments', () => {
  const found = findBody('int F(string s = "{") // {\n{ var t = "}"; return 1; }')
  assert.equal(found.kind, 'block')
  assert.equal('int F(string s = "{") // {\n{ var t = "}"; return 1; }'.slice(found.start, found.end), '{ var t = "}"; return 1; }')
})

test('an expression body is the text between the arrow and the semicolon', () => {
  const declaration = 'public int Twice(int x) => x * 2;'
  const found = findBody(declaration)
  assert.equal(found.kind, 'expression')
  assert.equal(declaration.slice(found.start, found.end), 'x * 2')
})

test('an arrow followed by a brace is a block body', () => {
  const declaration = 'const f = (a: number) => {\n  return a\n}'
  const found = findBody(declaration)
  assert.equal(found.kind, 'block')
  assert.equal(declaration.slice(found.start, found.end), '{\n  return a\n}')
})

test('a function type in a TypeScript annotation is not taken for the body', () => {
  const ts = { typeAnnotations: true }
  const slice = (declaration) => {
    const found = findBody(declaration, ts)
    return [found.kind, declaration.slice(found.start, found.end)]
  }
  assert.deepEqual(slice('make(): (x: number) => string { return f }'), ['block', '{ return f }'])
  assert.deepEqual(slice('load(): Promise<() => void> { return run() }'), ['block', '{ return run() }'])
  assert.deepEqual(slice('const f = (x: number): string => x.toString()'), ['expression', 'x.toString()'])
  assert.deepEqual(slice('const g: (x: number) => number = (x) => x + 1'), ['expression', 'x + 1'])
  assert.deepEqual(slice('const h = (a: number) => {\n  return a\n}'), ['block', '{\n  return a\n}'])
  assert.equal(findBody('public int Twice(int x) => x > 1 ? x : 0;').kind, 'expression')
})

test('a declaration without a body is refused', () => {
  assert.throws(() => findBody('int Count();'), /no body/)
})

test('a block body is replaced with the new statements indented under the declaration', () => {
  const plan = replaceBodyText(csharp, range(4, 7, 5), '\nif (x)\n  return 1;\nreturn 2;\n', { unit: '    ' })
  assert.equal(plan.kind, 'block')
  assert.match(plan.newText, /public int Count\(\)\n    \{\n        if \(x\)\n          return 1;\n        return 2;\n    \}\n/)
  assert.doesNotMatch(plan.newText, /lines\.Count/)
  assert.match(plan.newText, /Twice\(int x\) => x \* 2;/)
})

test('an expression body is replaced by the expression alone', () => {
  const plan = replaceBodyText(csharp, range(9, 9, 37), 'x + x;', { unit: '    ' })
  assert.equal(plan.kind, 'expression')
  assert.match(plan.newText, /Twice\(int x\) => x \+ x;/)
})

test('line endings of the file are kept', () => {
  const crlf = csharp.replaceAll('\n', '\r\n')
  const plan = replaceBodyText(crlf, range(4, 7, 5), 'return 1;', { unit: '    ' })
  assert.match(plan.newText, /\{\r\n {8}return 1;\r\n {4}\}/)
  assert.equal(plan.newText.replaceAll('\r\n', '').includes('\n'), false)
})

test('offsets and positions convert both ways across any line ending', () => {
  const text = 'ab\r\ncd\nef'
  const starts = lineStarts(text)
  assert.deepEqual(starts, [0, 4, 7])
  assert.equal(offsetOf(text, { line: 1, character: 1 }, starts), 5)
  assert.deepEqual(positionOf(text, 8, starts), { line: 2, character: 1 })
  assert.equal(renderBlock('', { baseIndent: '', unit: '  ', eol: '\n' }), '{\n}')
})

test('edits from several renames merge per file, and an identical edit is kept once', () => {
  const edit = (newText) => ({ documentChanges: [{ textDocument: { uri: 'file:///a.cs', version: 3 }, edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } }, newText }] }] })
  const other = { changes: { 'file:///b.cs': [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: 'Z' }] } }
  const merged = mergeEdits([edit('X'), edit('X'), other])
  assert.equal(merged.documentChanges.length, 2)
  assert.equal(countEdits(merged), 2)
  assert.equal(merged.documentChanges[0].textDocument.version, null)
  assert.equal(mergeEdits([{ documentChanges: [{ kind: 'rename', oldUri: 'a', newUri: 'b' }] }]), undefined)
})
