import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  FIRST_POLL_MS,
  MAX_POLL_MS,
  UsageError,
  commitAndPush,
  failedStepTail,
  failuresFromAnnotations,
  isDone,
  layerOf,
  nextDelay,
  parseArgs,
  selectJobs,
  stateFolder,
  summarize,
  verify,
  watch,
} from './verify.mjs';

const SHA = 'abc1234def5678';
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = (stderr = 'boom') => ({ status: 1, stdout: '', stderr });
const run = (overrides = {}) => ({ id: 1, name: 'ci', status: 'completed', conclusion: 'success', html_url: 'https://github.com/o/r/actions/runs/1', ...overrides });
const job = (name, overrides = {}) => ({ id: name.length, name, status: 'completed', conclusion: 'success', ...overrides });

function fakeGit({ branch = 'issue-95-x', dirty = '', upstream = SHA } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    const key = args.join(' ');
    if (key === 'rev-parse --abbrev-ref HEAD') return ok(`${branch}\n`);
    if (key === 'status --porcelain') return ok(dirty);
    if (key === 'rev-parse HEAD') return ok(`${SHA}\n`);
    if (key === 'rev-parse --verify -q @{u}') return upstream ? ok(`${upstream}\n`) : fail('');
    if (key === 'rev-parse --show-toplevel') return ok('/work/shop-95\n');
    if (key === 'rev-parse --path-format=absolute --git-common-dir') return ok('/work/shop/.git\n');
    return ok();
  };
  return { git, calls };
}

function fakeClock() {
  let t = 0;
  const sleeps = [];
  return { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, sleeps };
}

function fakeGh(responses) {
  const calls = [];
  const gh = (args) => {
    const path = args[1];
    calls.push(path);
    for (const [pattern, respond] of responses) {
      if (path.includes(pattern)) return typeof respond === 'function' ? respond(calls.filter((c) => c.includes(pattern)).length) : respond;
    }
    return fail(`no fake for ${path}`);
  };
  return { gh, calls };
}

test('parseArgs reads the message, layer flags, fail-fast and the timeout', () => {
  assert.deepEqual(parseArgs([]), { layers: [], message: undefined, failFast: false, timeoutMinutes: 9 });
  assert.deepEqual(parseArgs(['--e2e', '-m', 'Add cancel', '--backend', '--fail-fast', '--timeout', '4']), { layers: ['backend', 'e2e'], message: 'Add cancel', failFast: true, timeoutMinutes: 4 });
  assert.throws(() => parseArgs(['--all']), UsageError);
  assert.throws(() => parseArgs(['-m', ' ']), /commit message/);
  assert.throws(() => parseArgs(['--timeout', 'soon']), /minutes/);
});

test('layerOf reads the layer from the job name, e2e first', () => {
  assert.equal(layerOf('backend'), 'backend');
  assert.equal(layerOf('Backend tests (Orders)'), 'backend');
  assert.equal(layerOf('frontend-e2e'), 'e2e');
  assert.equal(layerOf('frontend lint'), 'frontend');
  assert.equal(layerOf('base'), undefined);
  assert.deepEqual(selectJobs([job('backend'), job('frontend'), job('base')], ['frontend']).map((j) => j.name), ['frontend']);
  assert.equal(selectJobs([job('a')], []).length, 1);
});

test('isDone waits for every run, or only the selected jobs, or the first failure with fail-fast', () => {
  const running = [run({ status: 'in_progress', conclusion: null })];
  const jobs = [job('backend', { conclusion: 'failure' }), job('frontend', { status: 'in_progress', conclusion: null })];
  assert.equal(isDone({ runs: [], jobs: [], layers: [], failFast: false }), false);
  assert.equal(isDone({ runs: running, jobs, layers: [], failFast: false }), false);
  assert.equal(isDone({ runs: running, jobs, layers: [], failFast: true }), true);
  assert.equal(isDone({ runs: running, jobs, layers: ['backend'], failFast: false }), true);
  assert.equal(isDone({ runs: running, jobs, layers: ['frontend'], failFast: false }), false);
  assert.equal(isDone({ runs: running, jobs, layers: ['e2e'], failFast: false }), false);
  assert.equal(isDone({ runs: [run()], jobs, layers: [], failFast: false }), true);
});

test('nextDelay backs off by half and stops at the maximum', () => {
  assert.equal(nextDelay(FIRST_POLL_MS), 7500);
  assert.equal(nextDelay(15000), MAX_POLL_MS);
  assert.equal(nextDelay(MAX_POLL_MS), MAX_POLL_MS);
});

test('commitAndPush commits changes with the message and pushes only when the remote is behind', () => {
  const dirty = fakeGit({ dirty: ' M a.cs\n', upstream: 'old' });
  assert.deepEqual(commitAndPush({ git: dirty.git, message: 'Add cancel' }), { sha: SHA, branch: 'issue-95-x', notes: ['committed', 'pushed'] });
  assert.ok(dirty.calls.includes('add -A'));
  assert.ok(dirty.calls.includes('commit -q -m Add cancel'));
  assert.ok(dirty.calls.includes('push -q'));

  const clean = fakeGit();
  assert.deepEqual(commitAndPush({ git: clean.git }).notes, []);
  assert.ok(!clean.calls.some((c) => c.startsWith('push')));

  const fresh = fakeGit({ upstream: '' });
  commitAndPush({ git: fresh.git });
  assert.ok(fresh.calls.includes('push -q -u origin HEAD'));
});

test('commitAndPush refuses main, a detached head and changes without a message', () => {
  assert.throws(() => commitAndPush({ git: fakeGit({ branch: 'main' }).git }), /will not push main/);
  assert.throws(() => commitAndPush({ git: fakeGit({ branch: 'HEAD' }).git }), /will not push HEAD/);
  assert.throws(() => commitAndPush({ git: fakeGit({ dirty: '?? new.ts' }).git }), /Pass -m/);
});

test('watch polls the exact commit with backoff and fetches jobs only once the runs complete', async () => {
  const clock = fakeClock();
  const { gh, calls } = fakeGh([
    [`runs?head_sha=${SHA}`, (n) => ok(JSON.stringify({ workflow_runs: n < 2 ? [] : [run(n < 4 ? { status: 'in_progress', conclusion: null } : {})] }))],
    ['/jobs?', ok(JSON.stringify({ jobs: [job('backend')] }))],
  ]);
  const result = await watch({ gh, sha: SHA, layers: [], failFast: false, timeoutMinutes: 9, ...clock });
  assert.equal(result.state, 'done');
  assert.deepEqual(clock.sleeps, [5000, 7500, 11250]);
  assert.equal(calls.filter((c) => c.includes('/jobs?')).length, 1);
  assert.deepEqual(result.jobs.map((j) => j.name), ['backend']);
});

test('watch stops at the timeout, and when no run starts', async () => {
  const running = fakeGh([[`head_sha`, ok(JSON.stringify({ workflow_runs: [run({ status: 'in_progress', conclusion: null })] }))]]);
  const timedOut = await watch({ gh: running.gh, sha: SHA, layers: [], failFast: false, timeoutMinutes: 1, ...fakeClock() });
  assert.equal(timedOut.state, 'timeout');

  const none = fakeGh([[`head_sha`, ok(JSON.stringify({ workflow_runs: [] }))]]);
  const noRun = await watch({ gh: none.gh, sha: SHA, layers: [], failFast: false, timeoutMinutes: 9, ...fakeClock() });
  assert.equal(noRun.state, 'no-run');
});

test('watch rides out two API errors in a row and gives up on the third', async () => {
  const flaky = fakeGh([[`head_sha`, (n) => (n <= 2 ? fail('502') : ok(JSON.stringify({ workflow_runs: [run()] })))], ['/jobs?', ok('{"jobs":[]}')]]);
  assert.equal((await watch({ gh: flaky.gh, sha: SHA, layers: [], failFast: false, timeoutMinutes: 9, ...fakeClock() })).state, 'done');
  const broken = fakeGh([[`head_sha`, fail('502')]]);
  await assert.rejects(watch({ gh: broken.gh, sha: SHA, layers: [], failFast: false, timeoutMinutes: 9, ...fakeClock() }), /502/);
});

test('failuresFromAnnotations keeps failures once each, without the exit code notice', () => {
  const annotations = [
    { annotation_level: 'failure', path: 'frontend/src/a.test.ts', start_line: 18, title: 'store removes a line', message: 'AssertionError: expected 2 to be 1\n\n at a.test.ts:18' },
    { annotation_level: 'failure', path: 'frontend/src/a.test.ts', start_line: 18, title: 'store removes a line', message: 'AssertionError: expected 2 to be 1\n\n at a.test.ts:18' },
    { annotation_level: 'failure', path: '.github', title: '', message: 'Process completed with exit code 1.' },
    { annotation_level: 'warning', path: 'x', message: 'Node 20 is deprecated' },
    { annotation_level: 'failure', path: '.github', message: 'The job was not started because recent account payments have failed' },
  ];
  assert.deepEqual(failuresFromAnnotations(annotations), [
    { name: 'frontend/src/a.test.ts:18 store removes a line', message: 'AssertionError: expected 2 to be 1\n at a.test.ts:18' },
    { name: 'error', message: 'The job was not started because recent account payments have failed' },
  ]);
});

test('failedStepTail keeps the lines before the first error and the error lines', () => {
  const log = [
    '2026-11-01T10:00:00.0000000Z ##[group]Run npm run lint',
    '2026-11-01T10:00:01.0000000Z \x1b[31msrc/a.ts: something odd\x1b[0m',
    ...Array.from({ length: 25 }, (_, i) => `2026-11-01T10:00:02.0000000Z noise ${i}`),
    '2026-11-01T10:00:03.0000000Z ##[error]Steiger found 2 problems',
    '2026-11-01T10:00:03.0000000Z ##[error]Process completed with exit code 1.',
  ].join('\n');
  const tail = failedStepTail(log).split('\n');
  assert.equal(tail.length, 21);
  assert.equal(tail[0], 'noise 5');
  assert.equal(tail.at(-1), 'Steiger found 2 problems');
});

test('summarize lists jobs, then only the failures, and caps the output', () => {
  const jobs = [job('backend'), job('frontend', { conclusion: 'failure' }), job('e2e', { conclusion: 'skipped' })];
  const failures = [{ job: jobs[1], items: [{ name: 'src/a.test.ts:18 removes a line', message: 'expected 2 to be 1' }] }];
  const { text, failed } = summarize({ sha: SHA, runs: [run({ conclusion: 'failure' })], jobs, layers: [], failures, logFolder: '/logs' });
  assert.equal(failed, 1);
  assert.equal(text, [
    'CI ci on abc1234: failure https://github.com/o/r/actions/runs/1',
    '✓ backend',
    '✗ frontend (failure)',
    '- e2e (skipped)',
    '',
    '✗ frontend',
    '  src/a.test.ts:18 removes a line',
    '    expected 2 to be 1',
    '',
    'verify: 1 job(s) failed. Logs of the failed jobs: /logs',
  ].join('\n'));

  const many = [{ job: jobs[1], items: Array.from({ length: 200 }, (_, i) => ({ name: `T${i}`, message: 'x'.repeat(100) })) }];
  const capped = summarize({ sha: SHA, runs: [run()], jobs, layers: [], failures: many, logFolder: '/logs' }).text;
  assert.ok(capped.length <= 4000, `${capped.length}`);
  assert.match(capped, /cut; grep the job logs/);
});

test('summarize names the jobs it did not wait for', () => {
  const { text } = summarize({ sha: SHA, runs: [run()], jobs: [job('backend'), job('base'), job('frontend')], layers: ['backend'], failures: [], logFolder: '/l' });
  assert.match(text, /✓ backend\n- not waited for: base, frontend\n\nverify: CI green on abc1234\.$/);
});

test('stateFolder is per app and worktree in the env-state folder', () => {
  assert.equal(stateFolder({ home: '/home/me', app: 'shop', worktree: 'shop-95' }), join('/home/me', '.claudalisk', 'apps', 'shop', 'verify', 'shop-95'));
});

test('verify pushes, waits, prints the annotated failures and saves the failed job logs', async () => {
  const { git } = fakeGit({ dirty: ' M a.ts', upstream: 'old' });
  const { gh, calls } = fakeGh([
    [`head_sha`, ok(JSON.stringify({ workflow_runs: [run({ conclusion: 'failure' })] }))],
    ['/jobs?', ok(JSON.stringify({ jobs: [job('backend', { id: 11 }), job('frontend', { id: 12, conclusion: 'failure' })] }))],
    ['check-runs/12/annotations', ok(JSON.stringify([{ annotation_level: 'failure', path: 'frontend/src/a.test.ts', start_line: 3, title: 'removes', message: 'expected 2 to be 1' }]))],
    ['jobs/12/logs', ok('2026-11-01T10:00:00.0000000Z full log line\n')],
  ]);
  const printed = [];
  const logs = new Map();
  const code = await verify({ argv: ['-m', 'Fix'], git, gh, home: '/home/me', ...fakeClock(), write: (t) => printed.push(t), writeLog: (p, t) => logs.set(p, t) });
  assert.equal(code, 1);
  assert.ok(!calls.some((c) => c.includes('check-runs/11')));
  assert.match(printed[0], /^committed and pushed abc1234\nCI ci on abc1234: failure/);
  assert.match(printed[0], /✗ frontend\n {2}frontend\/src\/a.test.ts:3 removes\n {4}expected 2 to be 1/);
  const folder = stateFolder({ home: '/home/me', app: 'shop', worktree: 'shop-95' });
  assert.deepEqual([...logs], [[join(folder, 'frontend.log'), 'full log line\n']]);
});

test('verify falls back to the failed step when a job has no annotations, and returns 0 when green', async () => {
  const red = fakeGh([
    [`head_sha`, ok(JSON.stringify({ workflow_runs: [run({ conclusion: 'failure' })] }))],
    ['/jobs?', ok(JSON.stringify({ jobs: [job('frontend lint', { id: 5, conclusion: 'failure' })] }))],
    ['annotations', ok('[]')],
    ['jobs/5/logs', ok('steiger: slice imports a sibling\n##[error]Process completed with exit code 1.')],
  ]);
  const printed = [];
  await verify({ argv: [], git: fakeGit().git, gh: red.gh, home: '/h', ...fakeClock(), write: (t) => printed.push(t), writeLog: () => {} });
  assert.match(printed[0], /last lines of the failed step\n {4}steiger: slice imports a sibling/);

  const green = fakeGh([[`head_sha`, ok(JSON.stringify({ workflow_runs: [run()] }))], ['/jobs?', ok(JSON.stringify({ jobs: [job('backend')] }))]]);
  assert.equal(await verify({ argv: [], git: fakeGit().git, gh: green.gh, home: '/h', ...fakeClock(), write: () => {}, writeLog: () => {} }), 0);
});

test('verify tells the agent to run it again when CI outlasts the timeout', async () => {
  const slow = fakeGh([[`head_sha`, ok(JSON.stringify({ workflow_runs: [run({ status: 'in_progress', conclusion: null })] }))]]);
  const printed = [];
  const code = await verify({ argv: ['--timeout', '1'], git: fakeGit().git, gh: slow.gh, home: '/h', ...fakeClock(), write: (t) => printed.push(t), writeLog: () => {} });
  assert.equal(code, 3);
  assert.match(printed[0], /CI ci on abc1234: in_progress[\s\S]*still running after 1 min\. Run node scripts\/verify\.mjs again/);
});
