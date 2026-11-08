import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STEP_ERROR_LIMIT = 10;
const MESSAGE_LINES = 6;

const decodeXml = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

const firstLines = (text, count = MESSAGE_LINES) => text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(0, count).join('\n');

const stackFrames = (stack) => stack.split('\n').flatMap((text) => {
  const start = text.indexOf(' in ');
  if (start < 0) return [];
  const rest = text.slice(start + ' in '.length);
  const end = /:line (\d+)/.exec(rest);
  return end?.index ? [{ file: rest.slice(0, end.index), line: Number(end[1]) }] : [];
});

const elementText = (xml, name) => {
  const open = `<${name}>`;
  const start = xml.indexOf(open);
  if (start < 0) return '';
  const contentStart = start + open.length;
  const end = xml.indexOf(`</${name}>`, contentStart);
  return end < 0 ? '' : xml.slice(contentStart, end);
};

export function location(stack, workspace) {
  const root = workspace ? `${workspace.replace(/\\/g, '/').replace(/\/$/, '')}/` : '';
  for (const { file, line } of stackFrames(stack)) {
    const path = file.replace(/\\/g, '/');
    if (!root || path.startsWith(root)) return { file: root ? path.slice(root.length) : path, line };
  }
  return null;
}

export function failedTests(xml, workspace) {
  const attr = (attrs, name) => attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const failures = [];
  let passed = 0;
  for (const [, attrs, body = ''] of xml.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g)) {
    const outcome = attr(attrs, 'outcome');
    if (outcome === 'Passed') passed++;
    if (outcome !== 'Failed') continue;
    const message = decodeXml(elementText(body, 'Message'));
    const stack = decodeXml(elementText(body, 'StackTrace'));
    failures.push({ name: decodeXml(attr(attrs, 'testName') ?? ''), message: firstLines(message) || firstLines(stack, 2), ...location(stack, workspace) });
  }
  return { passed, failures };
}

const escapeData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function annotations(failures, limit = STEP_ERROR_LIMIT) {
  const shown = failures.length > limit ? failures.slice(0, limit - 1) : failures;
  const lines = shown.map((f) => {
    const props = [f.file && `file=${escapeProperty(f.file)}`, f.line && `line=${f.line}`, `title=${escapeProperty(f.name)}`].filter(Boolean).join(',');
    return `::error ${props}::${escapeData(f.message || f.name)}`;
  });
  if (shown.length < failures.length) {
    const rest = failures.slice(shown.length).map((f) => f.name).join('\n');
    lines.push(`::error title=${escapeProperty(`${failures.length - shown.length} more failing tests`)}::${escapeData(rest)}`);
  }
  return lines;
}

const escapeCell = (text) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

export function summary(failures, passed) {
  const rows = failures.map((f) => `| ${escapeCell(f.name)} | ${f.file ? `${f.file}:${f.line}` : ''} | ${escapeCell(f.message.split('\n')[0])} |`);
  return [`### .NET tests: ${passed} passed, ${failures.length} failed`, '', ...(failures.length ? ['| Test | Where | Message |', '|---|---|---|', ...rows, ''] : [])].join('\n');
}

export function report(dir, { workspace = process.env.GITHUB_WORKSPACE, write = console.log, appendSummary } = {}) {
  if (!existsSync(dir)) { write(`::notice title=No TRX reports::${escapeData(`${dir} does not exist`)}`); return; }
  const results = readdirSync(dir).filter((f) => f.endsWith('.trx')).map((f) => failedTests(readFileSync(join(dir, f), 'utf8'), workspace));
  const failures = results.flatMap((r) => r.failures);
  const passed = results.reduce((sum, r) => sum + r.passed, 0);
  for (const line of annotations(failures)) write(line);
  appendSummary?.(summary(failures, passed));
}

export function trxAnnotations({ argv, env = process.env }) {
  const dir = argv[0];
  if (!dir) {
    console.error('Usage: node scripts/trx-annotations.mjs <TRX results directory>');
    return 2;
  }
  const file = env.GITHUB_STEP_SUMMARY;
  report(dir, { workspace: env.GITHUB_WORKSPACE, appendSummary: file ? (text) => appendFileSync(file, `${text}\n`) : undefined });
  return 0;
}
