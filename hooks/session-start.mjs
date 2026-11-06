#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConfig } from './guardrail.mjs';

export const HEALTH_TIMEOUT_MS = 500;
export const GH_TIMEOUT_MS = 2000;
const PORT = 80;

const short = (sha) => (typeof sha === 'string' && sha ? sha.slice(0, 7) : 'unknown');

export function probeHealth(host, { port = PORT, timeout = HEALTH_TIMEOUT_MS } = {}) {
  return new Promise((done) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/health', method: 'GET', headers: { Host: host }, timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          done({ httpStatus: res.statusCode, status: body.status, ref: body.deployedRef, sha: body.deployedSha });
        } catch {
          done(null);
        }
      });
      res.on('error', () => done(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => done(null));
    req.end();
  });
}

function run(file, args, cwd) {
  return new Promise((done) => {
    execFile(file, args, { cwd, encoding: 'utf8', timeout: GH_TIMEOUT_MS, windowsHide: true }, (error, stdout) => done(error ? null : stdout));
  });
}

export const realGit = (args, cwd) => run('git', args, cwd);
export const realGh = (args, cwd) => run('gh', args, cwd);

async function json(call) {
  try {
    const text = await call();
    return text === null || text === undefined ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function environment(name, health) {
  if (!health) return { line: `${name} is down`, ref: null };
  const ref = typeof health.ref === 'string' && health.ref ? health.ref : 'unknown';
  const unhealthy = health.httpStatus !== 200 ? ` (${health.httpStatus}${health.status ? `: ${health.status}` : ''})` : '';
  return { line: `${name} runs ${ref}@${short(health.sha)}${unhealthy}`, ref: ref === 'unknown' ? null : ref };
}

export async function build(input, deps = {}) {
  const cwd = input.cwd ?? process.cwd();
  const config = deps.findConfig(cwd);
  if (!config) return null;
  const { probe, gh, git } = deps;
  const repo = ['-R', config.repo];

  const [dev, uat, branchText] = await Promise.all([
    probe(`${config.hostPrefix}.dev.localhost`),
    probe(`${config.hostPrefix}.uat.localhost`),
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
  ]);
  const branch = (branchText ?? '').trim();

  const devEnv = environment('dev', dev);
  const uatEnv = environment('uat', uat);
  const lines = ['Before starting an issue, read the claudalisk:workflow skill (one session per issue, subagents, CI in one call).'];

  let fallback = null;
  let uatPr = null;
  const openPr = async (ref) => {
    const list = await json(() => gh(['pr', 'list', ...repo, '--head', ref, '--state', 'open', '--json', 'number', '--limit', '1'], cwd));
    return Array.isArray(list) && list[0] ? list[0].number : null;
  };
  const tasks = [];
  if (uatEnv.ref) tasks.push(openPr(uatEnv.ref).then((n) => { uatPr = n; }));
  if (!uat) {
    tasks.push((async () => {
      const list = await json(() => gh(['api', `repos/${config.repo}/deployments?environment=uat&per_page=1`], cwd));
      const latest = Array.isArray(list) ? list[0] : null;
      if (latest && typeof latest.sha === 'string') {
        const ref = typeof latest.ref === 'string' && latest.ref ? latest.ref : null;
        fallback = `${ref ?? 'unknown'}@${short(latest.sha)}`;
        if (ref) uatPr = await openPr(ref);
      }
    })());
  }
  let branchPr = null;
  if (branch && branch !== 'HEAD') {
    tasks.push(openPr(branch).then((n) => { branchPr = n; }));
  }
  await Promise.all(tasks);

  const health = [devEnv.line, fallback ? `uat is down; its last recorded deployment (not a live reading) is ${fallback}` : uatEnv.line];
  lines.push(`${health.join('; ')}.`);
  if (branch) lines.push(`Current branch: ${branch}${branchPr ? `, open pull request #${branchPr}` : ''}.`);
  if (uatPr) lines.push(`uat shows pull request #${uatPr}, which awaits the owner's review.`);
  return lines.join('\n');
}

export async function decide(input, deps = {}) {
  try {
    const text = await build(input, deps);
    if (!text) return null;
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
  } catch {
    return null;
  }
}

async function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const appConfig = await import('../tools/app-config.mjs');
    const result = await Promise.race([decide(input, {
      findConfig: (cwd) => { try { return findConfig(cwd, appConfig); } catch { return null; } },
      probe: (host) => probeHealth(host),
      gh: realGh,
      git: realGit,
    }), new Promise((done) => setTimeout(() => done(null), 4500).unref())]);
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
