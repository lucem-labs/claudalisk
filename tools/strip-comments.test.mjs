import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { commentRanges, DEFAULT_PATHS, loadTypeScript, parseArgs, stripAppComments, stripComments } from './strip-comments.mjs';

const strip = (text, fileName = 'file.tsx') => stripComments(ts, text, fileName);

test('parseArgs reads the app and the paths, and defaults to src/shared', () => {
  assert.deepEqual(parseArgs(['--app', 'frontend']), { app: 'frontend', paths: DEFAULT_PATHS });
  assert.deepEqual(parseArgs(['--app', 'f', 'src/shared/ui/sidebar.tsx']), { app: 'f', paths: ['src/shared/ui/sidebar.tsx'] });
  assert.throws(() => parseArgs([]), /Usage/);
  assert.throws(() => parseArgs(['--app', 'f', '--all']), /Unknown argument/);
});

test('removes whole-line comments with their lines', () => {
  const text = ['function a() {', '  // This is the state.', '  /* A block', '     over lines. */', '  return 1', '}', ''].join('\n');
  assert.equal(strip(text), ['function a() {', '  return 1', '}', ''].join('\n'));
});

test('removes a comment after code and keeps the code', () => {
  assert.equal(strip('const width = 16 // Random width.\n'), 'const width = 16\n');
  assert.equal(strip('call(/* first */ a, b)\n'), 'call(a, b)\n');
  assert.equal(strip('const a = 1/* gap */+2\n'), 'const a = 1 +2\n');
});

test('removes a JSX comment with its braces', () => {
  const text = ['const x = (', '  <div>', '    {/* This handles the gap */}', '    <span>Gap</span>', '  </div>', ')', ''].join('\n');
  assert.equal(strip(text), ['const x = (', '  <div>', '    <span>Gap</span>', '  </div>', ')', ''].join('\n'));
});

test('removes a JSX comment inside a line or over lines without adding text', () => {
  assert.equal(strip('const x = <div>{\n  // note\n}</div>\n'), 'const x = <div></div>\n');
  assert.equal(strip('const x = <p>a{/* b */}c</p>\n'), 'const x = <p>ac</p>\n');
});

test('keeps CRLF line endings', () => {
  assert.equal(strip('const a = 1 // x\r\nconst b = 2\r\n', 'file.ts'), 'const a = 1\r\nconst b = 2\r\n');
  assert.equal(strip('// x\r\nconst b = 2\r\n', 'file.ts'), 'const b = 2\r\n');
});

test('refuses to strip when the result has more parse errors than the source', () => {
  const breaking = (marker) => ({
    ...ts,
    createSourceFile: (name, text, ...rest) =>
      Object.assign(ts.createSourceFile(name, text, ...rest), { parseDiagnostics: text.includes(marker) ? [] : [{}] }),
  });
  assert.throws(() => stripComments(breaking('// x'), 'a() // x\n', 'f.ts'), /would break it/);
  assert.equal(stripComments(breaking('never'), 'a() // x\n', 'f.ts'), 'a()\n');
});

test('leaves strings, template literals, regular expressions and JSX text alone', () => {
  const text = [
    'const url = "https://example.com/*not*/"',
    "const quote = 'it\\'s // fine'",
    'const t = `a // b ${url} /* c */`',
    'const r = /\\/\\/ x/',
    "const x = <p>Don't // keep /* this */ text</p>",
    '',
  ].join('\n');
  assert.deepEqual(commentRanges(ts, text, 'file.tsx'), []);
  assert.equal(strip(text), text);
});

test('keeps lint and compiler directives and the shebang', () => {
  const text = [
    '#!/usr/bin/env node',
    '/// <reference types="vite/client" />',
    '/* eslint-disable */',
    '// oxlint-disable-next-line no-console',
    '// @ts-nocheck',
    '// eslint-disable-next-line no-console',
    'console.log(1)',
    '// @ts-expect-error untyped',
    'x()',
    '',
  ].join('\n');
  assert.equal(strip(text, 'file.ts'), text);
  assert.equal(strip('// eslint is great\nx()\n', 'file.ts'), 'x()\n');
});

test('strips the source files under the app paths and reports what changed', () => {
  const root = mkdtempSync(join(tmpdir(), 'strip-comments-'));
  try {
    mkdirSync(join(root, 'src', 'shared', 'ui'), { recursive: true });
    mkdirSync(join(root, 'src', 'pages'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, 'src', 'shared', 'ui', 'sidebar.tsx'), '// Upstream note.\nexport const a = 1\n');
    writeFileSync(join(root, 'src', 'shared', 'ui', 'button.tsx'), 'export const b = 2\n');
    writeFileSync(join(root, 'src', 'shared', 'ui', 'notes.md'), '// not code\n');
    writeFileSync(join(root, 'src', 'pages', 'home.tsx'), '// Out of scope.\nexport const c = 3\n');

    assert.deepEqual(stripAppComments(root, DEFAULT_PATHS, { ts }), ['src/shared/ui/sidebar.tsx']);
    assert.equal(readFileSync(join(root, 'src', 'shared', 'ui', 'sidebar.tsx'), 'utf8'), 'export const a = 1\n');
    assert.equal(readFileSync(join(root, 'src', 'shared', 'ui', 'notes.md'), 'utf8'), '// not code\n');
    assert.equal(readFileSync(join(root, 'src', 'pages', 'home.tsx'), 'utf8'), '// Out of scope.\nexport const c = 3\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadTypeScript refuses an app without typescript', () => {
  const root = mkdtempSync(join(tmpdir(), 'strip-comments-'));
  try {
    writeFileSync(join(root, 'package.json'), '{}');
    assert.throws(() => loadTypeScript(root), /no typescript package/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
