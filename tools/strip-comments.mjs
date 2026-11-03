#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from './registry.mjs';

const DIRECTIVE = /^(?:\/\/\/?|\/\*)\s*(?:(?:eslint|oxlint)-(?:disable|enable)(?:-next-line|-line)?(?:\s|\*\/|$)|@ts-(?:expect-error|ignore|nocheck|check)\b|<reference\s[^>]*\/>\s*$)/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const USAGE = 'Usage: node tools/strip-comments.mjs --app <frontend folder> [<path in the app>...]';

export const DEFAULT_PATHS = ['src/shared'];

export function parseArgs(argv) {
  const options = { app: undefined, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--app') options.app = argv[++i];
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else options.paths.push(arg);
  }
  if (!options.app) throw new Error(USAGE);
  if (options.paths.length === 0) options.paths = DEFAULT_PATHS;
  return options;
}

export function loadTypeScript(app) {
  try {
    return createRequire(join(resolve(app), 'package.json'))('typescript');
  } catch {
    throw new Error(`${resolve(app)} has no typescript package; run npm install in it first`);
  }
}

function parse(ts, text, fileName) {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
}

export function commentRanges(ts, text, fileName) {
  const source = parse(ts, text, fileName);
  const ranges = new Map();
  const jsxText = [];
  const add = (found) => {
    for (const range of found ?? []) if (!ranges.has(range.pos)) ranges.set(range.pos, { start: range.pos, end: range.end });
  };
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end]);
      return;
    }
    if (ts.isJsxExpression(node) && !node.expression && !node.dotDotDotToken) {
      const start = node.getStart(source);
      ranges.set(start, { start, end: node.end });
      return;
    }
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return [...ranges.values()]
    .filter(({ start }) => !jsxText.some(([from, to]) => start >= from && start < to))
    .filter(({ start, end }) => !DIRECTIVE.test(text.slice(start, end)))
    .sort((a, b) => a.start - b.start);
}

function removeRange(text, start, end) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', end);
  const lineEnd = newline < 0 ? text.length : newline;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (before.trim() === '' && after.trim() === '') return text.slice(0, lineStart) + text.slice(newline < 0 ? lineEnd : lineEnd + 1);
  if (after.trim() === '') return text.slice(0, lineStart) + before.trimEnd() + text.slice(lineEnd);
  if (before.trim() === '') return text.slice(0, start) + after.trimStart() + text.slice(lineEnd);
  const head = text.slice(0, start).replace(/[ \t]+$/, '');
  const tail = text.slice(end).replace(/^[ \t]+/, '');
  return head + (/[([{]$/.test(head) || /^[)\]},;.]/.test(tail) ? '' : ' ') + tail;
}

const parseErrors = (ts, text, fileName) => parse(ts, text, fileName).parseDiagnostics?.length ?? 0;

export function stripComments(ts, text, fileName) {
  const ranges = commentRanges(ts, text, fileName);
  if (ranges.length === 0) return text;
  let stripped = text;
  for (const { start, end } of ranges.reverse()) stripped = removeRange(stripped, start, end);
  if (parseErrors(ts, stripped, fileName) > parseErrors(ts, text, fileName)) {
    throw new Error(`${fileName}: removing its comments would break it; remove them by hand`);
  }
  return stripped;
}

export function stripAppComments(app, paths = DEFAULT_PATHS, { ts = loadTypeScript(app) } = {}) {
  const root = resolve(app);
  const changed = [];
  for (const path of paths) {
    const target = resolve(root, path);
    if (!existsSync(target)) continue;
    const files = SOURCE_EXTENSIONS.some((extension) => target.endsWith(extension)) ? [target] : listFiles(target, SOURCE_EXTENSIONS);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const stripped = stripComments(ts, text, file);
      if (stripped === text) continue;
      writeFileSync(file, stripped);
      changed.push(relative(root, file).replaceAll('\\', '/'));
    }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { app, paths } = parseArgs(process.argv.slice(2));
    const changed = stripAppComments(app, paths);
    console.log(changed.length ? `Removed comments from ${changed.join(', ')}` : 'No comments to remove.');
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
