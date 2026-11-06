import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, decide, probeHealth } from './session-start.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'session-start-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'session-start.mjs');
const CONFIG = { name: 'example-app', hostPrefix: 'example-app', repo: 'acme/example-app' };
const SHA_A = 'aaaaaaa1111111111111111111111111111111111';
const SHA_B = 'bbbbbbb2222222222222222222222222222222222';

function deps({ config = CONFIG, health = {}, branch = 'issue-5-thing\n', prs = {}, deployments = [], ghFails = false } = {}) {
  const calls = [];
  return {
    calls,
    findConfig: () => config,
    probe: async (host) => health[host] ?? null,
    git: async () => branch,
    gh: async (args) => {
      calls.push(args);
      if (ghFails) return null;
      if (args[0] === 'api') return JSON.stringify(deployments);
      const head = args[args.indexOf('--head') + 1];
      return JSON.stringify(prs[head] ? [{ number: prs[head] }] : []);
    },
  };
}

const up = (ref, sha) => ({ httpStatus: 200, status: 'healthy', ref, sha });
const both = { 'example-app.dev.localhost': up('main', SHA_A), 'example-app.uat.localhost': up('issue-4-other', SHA_B) };

function appAt(name) {
  const place = join(scratch, name);
  mkdirSync(join(place, '.git'), { recursive: true });
  mkdirSync(join(place, '.claude'), { recursive: true });
  writeFileSync(join(place, '.claude', 'claudalisk.json'), JSON.stringify({
    name: 'example-app',
    hostPrefix: 'example-app',
    repo: 'acme/example-app',
    databases: [{ role: 'app', envVar: 'DB' }],
    ports: { devDb: 5432, apiLocal: 5000 },
    uat: { composeProject: 'example-app-uat', volume: 'example-app-uat-data' },
  }));
  return place;
}

test('prints nothing outside a claudalisk app', async () => {
  assert.equal(await decide({ cwd: scratch }, deps({ config: null })), null);
});

test('names the workflow skill, both environments, the branch and the pull requests', async () => {
  const result = await decide({ cwd: scratch }, deps({ health: both, prs: { 'issue-5-thing': 12, 'issue-4-other': 9 } }));
  assert.equal(result.hookSpecificOutput.hookEventName, 'SessionStart');
  const text = result.hookSpecificOutput.additionalContext;
  assert.match(text, /claudalisk:workflow/);
  assert.match(text, /dev runs main@aaaaaaa; uat runs issue-4-other@bbbbbbb/);
  assert.match(text, /Current branch: issue-5-thing, open pull request #12/);
  assert.match(text, /uat shows pull request #9, which awaits the owner's review/);
});

test('omits the pull request lines when there are none', async () => {
  const text = await build({ cwd: scratch }, deps({ health: both }));
  assert.match(text, /Current branch: issue-5-thing\./);
  assert.doesNotMatch(text, /pull request/);
});

test('an environment with no answer reads down', async () => {
  const text = await build({ cwd: scratch }, deps({ health: { 'example-app.uat.localhost': up('issue-4-other', SHA_B) } }));
  assert.match(text, /dev is down; uat runs issue-4-other@bbbbbbb/);
});

test('a 503 reports the state its body gives', async () => {
  const health = { ...both, 'example-app.dev.localhost': { httpStatus: 503, status: 'unhealthy', ref: 'main', sha: SHA_A } };
  const text = await build({ cwd: scratch }, deps({ health }));
  assert.match(text, /dev runs main@aaaaaaa \(503: unhealthy\); uat runs/);
});

test('uat down falls back to the latest recorded deployment and says it is not live', async () => {
  const d = deps({
    health: { 'example-app.dev.localhost': up('main', SHA_A) },
    deployments: [{ ref: 'issue-4-other', sha: SHA_B }],
    prs: { 'issue-4-other': 9 },
  });
  const text = await build({ cwd: scratch }, d);
  assert.match(text, /dev runs main@aaaaaaa; uat is down; its last recorded deployment \(not a live reading\) is issue-4-other@bbbbbbb\./);
  assert.match(text, /uat shows pull request #9/);
  assert.ok(d.calls.some((c) => c[0] === 'api' && c[1].includes('environment=uat')));
});

test('uat down with no deployment says only that uat is down', async () => {
  const text = await build({ cwd: scratch }, deps({ health: { 'example-app.dev.localhost': up('main', SHA_A) } }));
  assert.match(text, /uat is down\./);
  assert.doesNotMatch(text, /last recorded/);
});

test('failing gh drops the lines that need it and keeps the health line', async () => {
  const text = await build({ cwd: scratch }, deps({ health: { 'example-app.dev.localhost': up('main', SHA_A) }, ghFails: true }));
  assert.match(text, /dev runs main@aaaaaaa; uat is down\./);
  assert.match(text, /Current branch: issue-5-thing\./);
  assert.doesNotMatch(text, /pull request|recorded/);
});

test('a failing dependency never throws', async () => {
  const broken = { ...deps({ health: both }), probe: async () => { throw new Error('boom'); } };
  assert.equal(await decide({ cwd: scratch }, broken), null);
});

test('probeHealth sends the name in the Host header and reads a 503 body', async () => {
  let seen;
  const server = createServer((req, res) => {
    seen = { host: req.headers.host, url: req.url };
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'unhealthy', deployedRef: 'main', deployedSha: SHA_A }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const result = await probeHealth('example-app.dev.localhost', { port: server.address().port });
    assert.deepEqual(result, { httpStatus: 503, status: 'unhealthy', ref: 'main', sha: SHA_A });
    assert.deepEqual(seen, { host: 'example-app.dev.localhost', url: '/api/health' });
  } finally {
    server.close();
  }
});

test('probeHealth gives null when nothing answers within the timeout', async () => {
  const server = createServer(() => {});
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    assert.equal(await probeHealth('example-app.dev.localhost', { port: server.address().port, timeout: 50 }), null);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('spawned with input on stdin it prints nothing outside an app and exits 0', () => {
  const place = join(scratch, 'plain');
  mkdirSync(join(place, '.git'), { recursive: true });
  const run = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify({ cwd: place }), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
});

test('spawned inside an app it prints the SessionStart block and exits 0', () => {
  const place = appAt('app');
  const run = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify({ cwd: place }), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /claudalisk:workflow/);
});

test('spawned with unreadable input it prints nothing and exits 0', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { input: 'not json', encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
});
