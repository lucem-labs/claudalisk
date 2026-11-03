#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_FOLDER = join(REPO_ROOT, 'frontend', 'e2e');

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const ALLOWED = '`getByRole`, `getByLabel` or `getByTestId`';

const PAGE_SELECTOR_METHODS = [
  'check', 'click', 'dblclick', 'dispatchEvent', 'dragAndDrop', 'fill', 'focus', 'getAttribute', 'hover', 'innerHTML',
  'innerText', 'inputValue', 'isChecked', 'isDisabled', 'isEditable', 'isEnabled', 'isHidden', 'isVisible', 'press',
  'selectOption', 'setChecked', 'setInputFiles', 'tap', 'textContent', 'type', 'uncheck',
];

const RULES = [
  { pattern: /\.locator\s*\(/g, message: `\`locator()\` finds by CSS or element structure. Use ${ALLOWED}, and \`filter({ has })\` to narrow.` },
  { pattern: /\.frameLocator\s*\(/g, message: `\`frameLocator()\` finds the frame by CSS. Use \`getByTestId(...).contentFrame()\`.` },
  { pattern: /\.\$\$?(?:eval)?\s*\(/g, message: `\`$\`, \`$$\`, \`$eval\` and \`$$eval\` find by selector. Use ${ALLOWED}.` },
  { pattern: /\.waitForSelector\s*\(/g, message: `\`waitForSelector()\` finds by selector. Wait on a ${ALLOWED} locator.` },
  { pattern: /\.querySelector(?:All)?\s*\(/g, message: `\`querySelector()\` finds by element structure. Use ${ALLOWED}.` },
  { pattern: new RegExp(`\\b(?:\\w*[Pp]age|frame|popup)\\s*\\.\\s*(?:${PAGE_SELECTOR_METHODS.join('|')})\\s*\\(`, 'g'), message: `Page methods that take a selector find by CSS. Call the method on a ${ALLOWED} locator.` },
];

const position = (text, index) => {
  const before = text.slice(0, index).split('\n');
  return { line: before.length, col: before.at(-1).length + 1 };
};

export function findViolations(text) {
  const found = [];
  for (const { pattern, message } of RULES) {
    for (const match of text.matchAll(pattern)) found.push({ ...position(text, match.index), message });
  }
  return found.sort((a, b) => a.line - b.line || a.col - b.col);
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

export function format({ file, line, col, message }, github) {
  return github
    ? `::error file=${escapeProperty(file)},line=${line},col=${col},title=E2E locator::${escapeData(message)}`
    : `${file}:${line}:${col}: ${message}`;
}

const isFolder = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };

export function check(dir = DEFAULT_FOLDER, { root = REPO_ROOT, github = Boolean(process.env.GITHUB_ACTIONS), write = console.log, error = console.error } = {}) {
  if (!isFolder(dir)) {
    const message = `${dir} is not a folder`;
    error(github ? `::error title=E2E locator::${escapeData(message)}` : message);
    return 2;
  }
  const violations = sourceFiles(dir).flatMap((path) => {
    const file = relative(root, path).replace(/\\/g, '/');
    return findViolations(readFileSync(path, 'utf8')).map((v) => ({ file, ...v }));
  });
  for (const v of violations) write(format(v, github));
  return violations.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = check(process.argv[2] ? resolve(process.argv[2]) : DEFAULT_FOLDER);
}
