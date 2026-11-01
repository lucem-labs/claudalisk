#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = ['backend', 'frontend', 'e2e'];
export const OUTPUT_LIMIT = 4000;
export const DEFAULT_TIMEOUT_MINUTES = 9;
export const FIRST_POLL_MS = 5000;
export const MAX_POLL_MS = 20000;
export const NO_RUN_LIMIT_MS = 90000;
const TAIL_LINES = 20;
const MESSAGE_LINES = 6;
const OK_CONCLUSIONS = ['success', 'skipped', 'neutral'];
const PROCESS_EXIT = /^Process completed with exit code \d+\.?$/;
const USAGE = 'Usage: node scripts/verify.mjs [-m "<commit message>"] [--backend] [--frontend] [--e2e] [--fail-fast] [--timeout <minutes>]';

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { layers: [], message: undefined, failFast: false, timeoutMinutes: DEFAULT_TIMEOUT_MINUTES };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-m' || arg === '--message') options.message = argv[++i];
    else if (arg === '--fail-fast') options.failFast = true;
    else if (arg === '--timeout') options.timeoutMinutes = Number(argv[++i]);
    else if (arg.startsWith('--') && LAYERS.includes(arg.slice(2))) options.layers.push(arg.slice(2));
    else throw new UsageError(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (options.message !== undefined && !options.message.trim()) throw new UsageError(`-m needs a commit message\n${USAGE}`);
  if (!(options.timeoutMinutes > 0)) throw new UsageError(`--timeout needs a number of minutes\n${USAGE}`);
  options.layers = LAYERS.filter((layer) => options.layers.includes(layer));
  return options;
}

export function layerOf(jobName) {
  const words = jobName.toLowerCase().split(/[^a-z0-9]+/);
  return ['e2e', 'backend', 'frontend'].find((layer) => words.includes(layer));
}

export const selectJobs = (jobs, layers) => (layers.length ? jobs.filter((j) => layers.includes(layerOf(j.name))) : jobs);
export const jobFailed = (job) => job.status === 'completed' && !OK_CONCLUSIONS.includes(job.conclusion);

export function isDone({ runs, jobs, layers, failFast }) {
  if (!runs.length) return false;
  const selected = selectJobs(jobs, layers);
  if (failFast && selected.some(jobFailed)) return true;
  if (runs.every((r) => r.status === 'completed')) return true;
  return layers.length > 0 && selected.length > 0 && selected.every((j) => j.status === 'completed');
}

export function nextDelay(delay) {
  return Math.min(Math.round(delay * 1.5), MAX_POLL_MS);
}

export function failuresFromAnnotations(annotations) {
  const seen = new Set();
  const failures = [];
  for (const a of annotations) {
    if (a.annotation_level !== 'failure' || PROCESS_EXIT.test(a.message ?? '')) continue;
    const where = a.path && a.path !== '.github' ? `${a.path}${a.start_line ? `:${a.start_line}` : ''}` : '';
    const message = String(a.message ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(0, MESSAGE_LINES).join('\n');
    const key = `${where}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push({ name: [where, a.title].filter(Boolean).join(' ') || 'error', message });
  }
  return failures;
}

export function cleanLog(log) {
  return String(log).replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\x1b\[[0-9;]*m/g, '').trimEnd());
}

export function failedStepTail(log) {
  const lines = cleanLog(log);
  const firstError = lines.findIndex((l) => l.startsWith('##[error]'));
  const end = firstError === -1 ? lines.length : firstError;
  const before = lines.slice(0, end).filter((l) => l && !l.startsWith('##[')).slice(-TAIL_LINES);
  const errors = lines.filter((l) => l.startsWith('##[error]') && !PROCESS_EXIT.test(l.slice(9))).map((l) => l.slice(9));
  return [...before, ...errors].join('\n');
}

const fileName = (name) => name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'job';

export function summarize({ sha, runs, jobs, layers, failures, logFolder, footer: footerOverride, limit = OUTPUT_LIMIT }) {
  const head = runs.map((r) => `CI ${r.name} on ${sha.slice(0, 7)}: ${r.conclusion ?? r.status} ${r.html_url}`);
  const selected = selectJobs(jobs, layers);
  for (const j of selected) {
    if (j.status !== 'completed') head.push(`… ${j.name} (${j.status})`);
    else if (jobFailed(j)) head.push(`✗ ${j.name} (${j.conclusion})`);
    else if (j.conclusion === 'skipped') head.push(`- ${j.name} (skipped)`);
    else head.push(`✓ ${j.name}`);
  }
  const unselected = jobs.filter((j) => !selected.includes(j)).map((j) => j.name);
  if (unselected.length) head.push(`- not waited for: ${unselected.join(', ')}`);
  const details = failures.map(({ job, items }) => [`✗ ${job.name}`, ...items.map((f) => `  ${f.name}${f.message ? `\n${f.message.split('\n').map((l) => `    ${l}`).join('\n')}` : ''}`)].join('\n'));
  const failed = selected.filter(jobFailed).length;
  const footer = footerOverride ?? (failed ? `verify: ${failed} job(s) failed. Logs of the failed jobs: ${logFolder}` : `verify: CI green on ${sha.slice(0, 7)}.`);
  const top = head.join('\n');
  let body = details.join('\n\n');
  const room = limit - top.length - footer.length - 4;
  if (body.length > room) {
    const note = '\n  … cut; grep the job logs for the rest';
    body = body.slice(0, Math.max(0, room - note.length)) + note;
  }
  return { text: [top, body, footer].filter(Boolean).join('\n\n'), failed };
}

export function stateFolder({ home, app, worktree }) {
  return join(home, '.claudalisk', 'apps', app, 'verify', worktree);
}

export function gitNames(git) {
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim();
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']).stdout.trim();
  return { app: basename(dirname(common)), worktree: basename(top) };
}

function must(result, what) {
  if (result.status !== 0) throw new Error(`${what} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.trim();
}

export function commitAndPush({ git, message }) {
  const branch = must(git(['rev-parse', '--abbrev-ref', 'HEAD']), 'git rev-parse');
  if (['HEAD', 'main', 'master'].includes(branch)) throw new UsageError(`verify pushes the issue branch; it will not push ${branch}.`);
  const notes = [];
  if (must(git(['status', '--porcelain']), 'git status')) {
    if (!message) throw new UsageError(`There are uncommitted changes. Pass -m "<commit message>" to commit them.\n${USAGE}`);
    must(git(['add', '-A']), 'git add');
    must(git(['commit', '-q', '-m', message]), 'git commit');
    notes.push('committed');
  }
  const sha = must(git(['rev-parse', 'HEAD']), 'git rev-parse');
  const upstream = git(['rev-parse', '--verify', '-q', '@{u}']);
  if (upstream.status !== 0) { must(git(['push', '-q', '-u', 'origin', 'HEAD']), 'git push'); notes.push('pushed'); }
  else if (upstream.stdout.trim() !== sha) { must(git(['push', '-q']), 'git push'); notes.push('pushed'); }
  return { sha, branch, notes };
}

export async function watch({ gh, sha, layers, failFast, timeoutMinutes, sleep, now }) {
  const json = (path) => JSON.parse(must(gh(['api', path]), `gh api ${path}`));
  const start = now();
  const deadline = start + timeoutMinutes * 60000;
  let delay = FIRST_POLL_MS;
  let errors = 0;
  let runs = [];
  let jobs = [];
  for (;;) {
    try {
      runs = json(`repos/{owner}/{repo}/actions/runs?head_sha=${sha}&per_page=50`).workflow_runs ?? [];
      const allCompleted = runs.length > 0 && runs.every((r) => r.status === 'completed');
      if (runs.length && (layers.length || failFast || allCompleted)) {
        jobs = runs.flatMap((r) => (json(`repos/{owner}/{repo}/actions/runs/${r.id}/jobs?per_page=100`).jobs ?? []).map((j) => ({ ...j, workflow: r.name })));
      }
      errors = 0;
      if (isDone({ runs, jobs, layers, failFast })) return { state: 'done', runs, jobs };
    } catch (error) {
      if (++errors >= 3) throw error;
    }
    if (!runs.length && now() - start >= NO_RUN_LIMIT_MS) return { state: 'no-run', runs, jobs };
    if (now() + delay > deadline) return { state: 'timeout', runs, jobs };
    await sleep(delay);
    delay = nextDelay(delay);
  }
}

export function collectFailures({ gh, jobs, layers, logFolder, writeLog }) {
  const failures = [];
  for (const job of selectJobs(jobs, layers).filter(jobFailed)) {
    if (job.conclusion === 'cancelled') { failures.push({ job, items: [{ name: 'cancelled, usually by a newer push to the branch' }] }); continue; }
    const annotations = gh(['api', `repos/{owner}/{repo}/check-runs/${job.id}/annotations?per_page=50`]);
    const log = gh(['api', `repos/{owner}/{repo}/actions/jobs/${job.id}/logs`]);
    if (log.status === 0) writeLog(join(logFolder, `${fileName(job.name)}.log`), cleanLog(log.stdout).join('\n'));
    const items = annotations.status === 0 ? failuresFromAnnotations(JSON.parse(annotations.stdout)) : [];
    failures.push({ job, items: items.length ? items : [{ name: 'last lines of the failed step', message: log.status === 0 ? failedStepTail(log.stdout) : 'log not available yet' }] });
  }
  return failures;
}

export async function verify({ argv, git, gh, home = homedir(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, write = console.log, writeLog = writeFileSync }) {
  const options = parseArgs(argv);
  const { sha, notes } = commitAndPush({ git, message: options.message });
  const logFolder = stateFolder({ home, ...gitNames(git) });
  const result = await watch({ gh, sha, ...options, sleep, now });
  const prefix = notes.length ? `${notes.join(' and ')} ${sha.slice(0, 7)}\n` : '';
  if (result.state === 'no-run') {
    write(`${prefix}verify: no CI run started for ${sha.slice(0, 7)} within ${NO_RUN_LIMIT_MS / 1000}s. Check that CI runs on pushes to this branch.`);
    return 2;
  }
  if (result.state === 'timeout') {
    const footer = `verify: CI is still running after ${options.timeoutMinutes} min. Run node scripts/verify.mjs again to keep waiting; it pushes nothing new.`;
    write(`${prefix}${summarize({ sha, runs: result.runs, jobs: result.jobs, layers: options.layers, failures: [], logFolder, footer }).text}`);
    return 3;
  }
  rmSync(logFolder, { recursive: true, force: true });
  mkdirSync(logFolder, { recursive: true });
  const failures = collectFailures({ gh, jobs: result.jobs, layers: options.layers, logFolder, writeLog });
  const { text, failed } = summarize({ sha, runs: result.runs, jobs: result.jobs, layers: options.layers, failures, logFolder });
  write(`${prefix}${text}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const run = (command) => (args) => spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  verify({ argv: process.argv.slice(2), git: run('git'), gh: run('gh') })
    .then((code) => { process.exitCode = code; })
    .catch((error) => { console.error(error.message); process.exitCode = 2; });
}
