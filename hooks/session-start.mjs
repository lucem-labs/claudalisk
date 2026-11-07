#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConfig } from './guardrail.mjs';

export const HEALTH_TIMEOUT_MS = 500;
export const GH_TIMEOUT_MS = 2000;
export const DEFAULT_PORT = 80;

const clean = (value) => (typeof value === 'string' ? value.replace(/[^\w./+-]/g, '').slice(0, 200) : '');

const short = (value) => {
  const sha = clean(value);
  return sha ? `${sha.slice(0, 7)}${sha.endsWith('-dirty') ? '-dirty' : ''}` : 'unknown';
};

export function probeHealth(host, { port = DEFAULT_PORT, timeout = HEALTH_TIMEOUT_MS } = {}) {
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
export const realDocker = (args) => run('docker', args);

async function json(call) {
  try {
    const text = await call();
    return text === null || text === undefined ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

const label = (value) => (typeof value === 'string' ? value.replace(/[^\w ./+-]/g, '').slice(0, 60) : '');

async function containerState(project, docker) {
  const text = await docker(['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{json .}}']);
  if (text === null || text === undefined) return null;
  const rows = [];
  for (const line of text.split(/\r?\n/).filter((l) => l.trim() !== '')) {
    const row = JSON.parse(line);
    rows.push({ state: row.State, supervisor: /(?:^|,)com\.docker\.compose\.service=supervisor(?:,|$)/.test(String(row.Labels ?? '')) });
  }
  const running = rows.filter((r) => r.state === 'running').length;
  const state = rows.length === 0 || running === 0 ? 'down' : running === rows.length ? 'up' : 'partly up';
  return { state, supervisor: rows.some((r) => r.supervisor && r.state === 'running') ? 'running' : 'stopped' };
}

export async function runnersLine(config, deps, cwd) {
  if (!deps.readRegistry) return null;
  let registry;
  try {
    registry = deps.readRegistry();
  } catch {
    return null;
  }
  const repo = config.repo;
  const stacks = registry.runners ?? [];
  const owner = repo.split('/')[0].toLowerCase();
  const stack = stacks.find((s) => s.scope === 'organization' && String(s.target).toLowerCase() === owner) ?? stacks.find((s) => s.scope === 'repository' && String(s.target).toLowerCase() === repo.toLowerCase());
  if (!stack) return `Runners: no runner stack serves ${repo} on this machine; self-hosted CI jobs will queue (/claudalisk:runners).`;
  const { gh, docker } = deps;
  const group = `orgs/${stack.target}/actions/runner-groups/${stack.groupId}`;
  const org = stack.scope === 'organization';
  const [containers, runners, repoInfo, groupInfo, members] = await Promise.all([
    docker ? json(async () => JSON.stringify(await containerState(stack.composeProject, docker))) : null,
    json(() => gh(['api', `${org ? 'orgs' : 'repos'}/${stack.target}/actions/runners?per_page=100`], cwd)),
    json(() => gh(['api', `repos/${repo}`], cwd)),
    org ? json(() => gh(['api', group], cwd)) : null,
    org ? json(() => gh(['api', `${group}/repositories?per_page=100`], cwd)) : null,
  ]);
  const prefix = deps.prefix ? deps.prefix(stack) : '';
  const head = containers ? `${containers.state} (supervisor ${containers.supervisor})` : 'unknown (supervisor unknown)';
  let counts = 'runners unknown';
  if (runners && Array.isArray(runners.runners)) {
    const mine = runners.runners.filter((r) => String(r.name).startsWith(prefix));
    counts = `${mine.filter((r) => r.status === 'online').length} of ${mine.length} runners online (${mine.filter((r) => r.busy).length} busy)`;
  }
  let where;
  if (!org) where = repoInfo ? `${repo} is ${repoInfo.private === true ? 'private' : 'PUBLIC'}` : `whether ${repo} is private is unknown`;
  else if (!repoInfo || !groupInfo || !members || !Array.isArray(members.repositories)) where = `whether ${repo} is in its runner group is unknown`;
  else if (repoInfo.private !== true) where = `${repo} is public, so these runners never serve it`;
  else if (members.repositories.some((r) => r.id === repoInfo.id)) where = `${repo} is in runner group ${label(groupInfo.name)}`;
  else if (members.total_count > members.repositories.length) where = `whether ${repo} is in its runner group is unknown`;
  else where = `${repo} is NOT in runner group ${label(groupInfo.name)}, so its CI jobs queue until GitHub cancels them (/claudalisk:runners enroll)`;
  return `Runners ${clean(stack.composeProject)}: ${head}, ${counts}; ${where}.`;
}

export function runnerPrefix(stack, read = readFileSync) {
  try {
    return /^RUNNERS_NAME_PREFIX=(.*)$/m.exec(String(read(join(stack.configDir, 'runners.env'), 'utf8')))?.[1].trim() ?? '';
  } catch {
    return '';
  }
}

function environment(name, health) {
  if (!health) return { line: `${name} is down`, ref: null };
  const ref = clean(health.ref) || 'unknown';
  const state = clean(health.status);
  const unhealthy = health.httpStatus !== 200 ? ` (${health.httpStatus}${state ? `: ${state}` : ''})` : '';
  return { line: `${name} runs ${ref}@${short(health.sha)}${unhealthy}`, ref: ref === 'unknown' ? null : ref };
}

export async function build(input, deps = {}) {
  const cwd = input.cwd ?? process.cwd();
  const config = deps.findConfig(cwd);
  if (!config) return null;
  const { probe, gh, git } = deps;
  const repo = ['-R', config.repo];

  const runnersTask = runnersLine(config, deps, cwd).catch(() => null);
  const [dev, uat, branchText] = await Promise.all([
    probe(`${config.hostPrefix}.dev.localhost`),
    probe(`${config.hostPrefix}.uat.localhost`),
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
  ]);
  const branch = (branchText ?? '').trim();

  const devEnv = environment('dev', dev);
  const uatEnv = environment('uat', uat);
  const lines = [
    'Before starting an issue, read the claudalisk:workflow skill (one session per issue, subagents, CI in one call).',
    "This app's AGENTS.md holds its facts and deviations, and wins over the plugin's decisions (CLA-0028).",
  ];

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
      const sha = clean(latest?.sha);
      if (sha) {
        const pulls = await json(() => gh(['api', `repos/${config.repo}/commits/${sha}/pulls`], cwd));
        const open = Array.isArray(pulls) ? pulls.find((p) => p.state === 'open') : null;
        const ref = clean(open?.head?.ref);
        fallback = ref ? `${ref}@${short(sha)}` : short(sha);
        uatPr = open?.number ?? null;
      }
    })());
  }
  let branchPr = null;
  if (branch && branch !== 'HEAD') {
    tasks.push(openPr(branch).then((n) => { branchPr = n; }));
  }
  await Promise.all(tasks);
  const runners = await runnersTask;

  const health = [devEnv.line, fallback ? `uat is down; its last recorded deployment (not a live reading) is ${fallback}` : uatEnv.line];
  lines.push(`${health.join('; ')}.`);
  if (branch === 'HEAD') lines.push('The checkout is on a detached HEAD.');
  else if (branch) lines.push(`Current branch: ${branch}${branchPr ? `, open pull request #${branchPr}` : ''}.`);
  if (uatPr) lines.push(fallback ? `uat last showed pull request #${uatPr}.` : `uat shows pull request #${uatPr}, which awaits the owner's review.`);
  if (runners) lines.push(runners);
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

export function registeredPort(readRegistry) {
  try {
    const port = readRegistry().proxy?.port;
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

async function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const appConfig = await import('../tools/app-config.mjs');
    let port = DEFAULT_PORT;
    let readRegistry = null;
    try {
      const registry = await import('../tools/app-registry.mjs');
      readRegistry = () => registry.readRegistry({ home: homedir() });
      port = registeredPort(readRegistry);
    } catch {
    }
    const result = await Promise.race([decide(input, {
      findConfig: (cwd) => { try { return findConfig(cwd, appConfig); } catch { return null; } },
      probe: (host) => probeHealth(host, { port }),
      gh: realGh,
      git: realGit,
      docker: realDocker,
      readRegistry,
      prefix: runnerPrefix,
    }), new Promise((done) => setTimeout(() => done(null), 4500).unref())]);
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
