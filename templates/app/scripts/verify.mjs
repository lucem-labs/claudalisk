#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = ['backend', 'frontend', 'e2e'];
export const DEFAULT_LAYERS = ['backend', 'frontend'];
export const OUTPUT_LIMIT = 4000;
const MESSAGE_LINES = 6;
const TAIL_LINES = 20;
const USAGE = 'Usage: node scripts/verify.mjs [--backend] [--frontend] [--e2e] [--all]';

export function parseArgs(argv) {
  const layers = new Set();
  for (const arg of argv) {
    if (arg === '--all') LAYERS.forEach((layer) => layers.add(layer));
    else if (LAYERS.includes(arg.slice(2)) && arg.startsWith('--')) layers.add(arg.slice(2));
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  return { layers: layers.size ? LAYERS.filter((layer) => layers.has(layer)) : DEFAULT_LAYERS, explicit: layers.size > 0 };
}

export function stateFolder({ home, app, worktree }) {
  return join(home, '.claudalisk', 'apps', app, 'verify', worktree);
}

export function plan({ root, layers, explicit, state, exists = existsSync, readText = (p) => readFileSync(p, 'utf8') }) {
  const steps = [];
  const missing = [];
  const backend = join(root, 'backend');
  const frontend = join(root, 'frontend');
  const scripts = exists(join(frontend, 'package.json')) ? Object.keys(JSON.parse(readText(join(frontend, 'package.json'))).scripts ?? {}) : null;

  for (const layer of layers) {
    if (layer === 'backend') {
      if (!exists(backend)) { missing.push('backend: no backend/ folder'); continue; }
      steps.push({ layer, name: 'build', command: 'dotnet', args: ['build', '-nologo'], cwd: backend, report: 'build' });
      steps.push({ layer, name: 'tests', command: 'dotnet', args: ['test', '--no-build', '-nologo', '--logger', 'trx', '--results-directory', join(state, 'trx')], cwd: backend, report: 'trx', reportPath: join(state, 'trx'), needs: 'build' });
    } else if (layer === 'frontend') {
      if (!scripts) { missing.push('frontend: no frontend/package.json'); continue; }
      for (const script of ['build', 'lint']) {
        if (scripts.includes(script)) steps.push({ layer, name: script, command: 'npm', args: ['run', script, '--silent'], cwd: frontend, report: 'build' });
      }
      steps.push({ layer, name: 'tests', command: 'npm', args: ['exec', '--no', '--', 'vitest', 'run', '--reporter=json', `--outputFile=${join(state, 'vitest.json')}`], cwd: frontend, report: 'vitest', reportPath: join(state, 'vitest.json') });
    } else if (layer === 'e2e') {
      if (!scripts) { missing.push('e2e: no frontend/package.json'); continue; }
      const reportPath = join(state, 'playwright.json');
      steps.push({ layer, name: 'tests', command: 'npm', args: ['exec', '--no', '--', 'playwright', 'test', '--reporter=json'], cwd: frontend, env: { PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath }, report: 'playwright', reportPath });
    }
  }
  return { steps, missing: explicit ? missing : [], skipped: explicit ? [] : missing };
}

const firstLines = (text, count = MESSAGE_LINES) => String(text ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l) => l && !/node_modules|node:internal/.test(l)).slice(0, count).join('\n');

const decodeXml = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

export function failuresFromTrx(xml) {
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const failures = [];
  let passed = 0;
  for (const [, attrs, body = ''] of xml.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g)) {
    const result = attr(attrs, 'outcome');
    if (result === 'Passed') passed++;
    if (result !== 'Failed') continue;
    const message = body.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? '';
    const stack = body.match(/<StackTrace>([\s\S]*?)<\/StackTrace>/)?.[1] ?? '';
    failures.push({ name: decodeXml(attr(attrs, 'testName') ?? ''), message: firstLines(`${decodeXml(message)}\n${firstLines(decodeXml(stack), 2)}`) });
  }
  return { passed, failures };
}

export function failuresFromVitest(report) {
  const failures = [];
  for (const file of report.testResults ?? []) {
    if (file.status === 'failed' && !(file.assertionResults ?? []).some((a) => a.status === 'failed')) {
      failures.push({ name: file.name, message: firstLines(file.message) });
    }
    for (const a of file.assertionResults ?? []) {
      if (a.status === 'failed') failures.push({ name: a.fullName ?? a.title, message: firstLines((a.failureMessages ?? []).join('\n')) });
    }
  }
  return { passed: report.numPassedTests ?? 0, failures };
}

export function failuresFromPlaywright(report) {
  const failures = [];
  let passed = 0;
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status === 'expected' || t.status === 'flaky') passed++;
        if (t.status !== 'unexpected') continue;
        const result = (t.results ?? []).at(-1) ?? {};
        const error = result.error ?? (result.errors ?? [])[0] ?? {};
        failures.push({ name: [...path, spec.title].filter(Boolean).join(' › ') + (t.projectName ? ` [${t.projectName}]` : ''), message: firstLines(error.message ?? result.status) });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, [suite.title]);
  for (const error of report.errors ?? []) failures.push({ name: 'Playwright', message: firstLines(error.message) });
  return { passed, failures };
}

const ERROR_LINE = /\berror\s*(?:[A-Z]+\d+)?\s*:|^\s*[×✘✗]\s/i;

export function failuresFromOutput(output) {
  const lines = String(output).replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd());
  const errors = [...new Set(lines.filter((l) => ERROR_LINE.test(l)).map((l) => l.trim()))];
  if (errors.length) return { failures: errors.map((line) => ({ name: line })) };
  return { failures: [{ name: 'output (last lines)', message: lines.filter(Boolean).slice(-TAIL_LINES).join('\n') }] };
}

export function readReport(step, { exists = existsSync, readText = (p) => readFileSync(p, 'utf8'), list = (p) => readdirSync(p) } = {}) {
  try {
    if (step.report === 'trx') {
      if (!exists(step.reportPath)) return null;
      const files = list(step.reportPath).filter((f) => f.endsWith('.trx'));
      if (!files.length) return null;
      return files.map((f) => failuresFromTrx(readText(join(step.reportPath, f)))).reduce((a, b) => ({ passed: a.passed + b.passed, failures: [...a.failures, ...b.failures] }));
    }
    if (!step.reportPath || !exists(step.reportPath)) return null;
    const report = JSON.parse(readText(step.reportPath));
    return step.report === 'vitest' ? failuresFromVitest(report) : failuresFromPlaywright(report);
  } catch {
    return null;
  }
}

export function outcome(step, run, reader = {}) {
  const structured = step.report === 'build' ? null : readReport(step, reader);
  const failed = run.status !== 0 || (structured?.failures.length ?? 0) > 0;
  if (!failed) return { ok: true, passed: structured?.passed, failures: [] };
  const found = structured?.failures.length ? structured : failuresFromOutput(run.output);
  return { ok: false, passed: structured?.passed, failures: found.failures };
}

export function summarize({ results, missing = [], skipped = [], logPath, limit = OUTPUT_LIMIT }) {
  const head = [];
  const details = [];
  for (const r of results) {
    const label = `${r.step.layer} ${r.step.name}`;
    if (r.skipped) { head.push(`- ${label}: skipped, ${r.skipped}`); continue; }
    const counts = r.passed !== undefined ? ` (${r.passed} passed${r.ok ? '' : `, ${r.failures.length} failed`})` : '';
    head.push(`${r.ok ? '✓' : '✗'} ${label}${counts}`);
    if (!r.ok) {
      const lines = r.failures.map((f) => `  ${f.name}${f.message ? `\n${f.message.split('\n').map((l) => `    ${l}`).join('\n')}` : ''}`);
      details.push([`✗ ${label}`, ...lines].join('\n'));
    }
  }
  for (const m of missing) head.push(`✗ ${m}`);
  for (const s of skipped) head.push(`- ${s}, skipped`);
  const failedSteps = results.filter((r) => !r.ok && !r.skipped).length + missing.length;
  const top = head.join('\n');
  const footer = `${failedSteps ? `verify: ${failedSteps} step(s) failed.` : 'verify: all green.'} Full log: ${logPath}`;
  let body = details.join('\n\n');
  const room = limit - top.length - footer.length - 4;
  if (body.length > room) {
    const note = '\n  … cut; grep the full log for the rest';
    body = body.slice(0, Math.max(0, room - note.length)) + note;
  }
  return { text: [top, body, footer].filter(Boolean).join('\n\n'), ok: failedSteps === 0 };
}

export function quoteForWindowsShell(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replaceAll('"', '""')}"` : arg;
}

export function runStep(step, platform = process.platform) {
  const env = { ...process.env, ...step.env };
  const options = { cwd: step.cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 };
  const result = platform === 'win32'
    ? spawnSync([step.command, ...step.args].map(quoteForWindowsShell).join(' '), [], { ...options, shell: true })
    : spawnSync(step.command, step.args, options);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`;
  return { status: result.status ?? 1, output };
}

export function gitNames(root, git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim()) {
  const top = git(['rev-parse', '--show-toplevel']) || root;
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return { app: basename(common ? dirname(common) : top), worktree: basename(top) };
}

export function verify({ root, argv, home = homedir(), names = gitNames(root), run = runStep, write = console.log, fs = { exists: existsSync, readText: (p) => readFileSync(p, 'utf8'), list: (p) => readdirSync(p) } }) {
  const { layers, explicit } = parseArgs(argv);
  const state = stateFolder({ home, ...names });
  rmSync(state, { recursive: true, force: true });
  mkdirSync(state, { recursive: true });
  const logPath = join(state, 'verify.log');
  const { steps, missing, skipped } = plan({ root, layers, explicit, state, exists: fs.exists, readText: fs.readText });
  const log = [];
  const results = [];
  for (const step of steps) {
    const blocker = results.find((r) => r.step.layer === step.layer && r.step.name === step.needs && !r.ok);
    if (blocker) { results.push({ step, ok: false, skipped: `${step.needs} failed` }); continue; }
    const ran = run(step);
    log.push(`$ ${step.command} ${step.args.join(' ')}  (in ${step.cwd}, exit ${ran.status})\n${ran.output}`);
    results.push({ step, ...outcome(step, ran, fs) });
  }
  writeFileSync(logPath, log.join('\n\n'));
  const summary = summarize({ results, missing, skipped, logPath });
  write(summary.text);
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = verify({ root: resolve(fileURLToPath(import.meta.url), '..', '..'), argv: process.argv.slice(2) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
