#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

const PAGE_SELECTOR_METHODS = [
  'check', 'click', 'dblclick', 'dispatchEvent', 'dragAndDrop', 'fill', 'focus', 'getAttribute', 'hover', 'innerHTML',
  'innerText', 'inputValue', 'isChecked', 'isDisabled', 'isEditable', 'isEnabled', 'isHidden', 'isVisible', 'press',
  'selectOption', 'setChecked', 'setInputFiles', 'tap', 'textContent', 'type', 'uncheck',
];

const RULES = [
  { pattern: /\.locator\s*\(/g, message: '`locator()` finds by CSS or element structure. Use `getByRole`, `getByLabel` or `getByTestId`.' },
  { pattern: /\.\$\$?(?:eval)?\s*\(/g, message: '`$`, `$$`, `$eval` and `$$eval` find by selector. Use `getByRole`, `getByLabel` or `getByTestId`.' },
  { pattern: /\.waitForSelector\s*\(/g, message: '`waitForSelector()` finds by selector. Wait on a `getByRole`, `getByLabel` or `getByTestId` locator.' },
  { pattern: /\.querySelector(?:All)?\s*\(/g, message: '`querySelector()` finds by element structure. Use `getByRole`, `getByLabel` or `getByTestId`.' },
  { pattern: new RegExp(`\\b(?:page|frame)\\.(?:${PAGE_SELECTOR_METHODS.join('|')})\\s*\\(`, 'g'), message: 'Page methods that take a selector find by CSS. Call the method on a `getByRole`, `getByLabel` or `getByTestId` locator.' },
];

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

export function findViolations(text) {
  const found = [];
  for (const { pattern, message } of RULES) {
    for (const match of text.matchAll(pattern)) found.push({ line: lineOf(text, match.index), message });
  }
  return found.sort((a, b) => a.line - b.line);
}

export function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

const escapeData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function format({ file, line, message }, github) {
  return github ? `::error file=${escapeProperty(file)},line=${line},title=E2E locator::${escapeData(message)}` : `${file}:${line}: ${message}`;
}

export function check(dir, { root = process.cwd(), github = Boolean(process.env.GITHUB_ACTIONS), write = console.log } = {}) {
  if (!existsSync(dir)) { write(`${dir} does not exist`); return 2; }
  const violations = sourceFiles(dir).flatMap((path) => {
    const file = relative(root, path).replace(/\\/g, '/');
    return findViolations(readFileSync(path, 'utf8')).map((v) => ({ file, ...v }));
  });
  for (const v of violations) write(format(v, github));
  return violations.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = check(process.argv[2] ?? 'frontend/e2e');
}
