import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatText, isGreen, latestHandoff, lifecycleStep, parseArgs, parseWorktrees, readFacts, slugify } from './work-issue.mjs';

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const check = (over = {}) => ({ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS', name: 'adrs', ...over });

const facts = (over = {}) => ({
  issue: { number: 16, state: 'OPEN', title: 'Work issue skill', labels: ['enhancement'] },
  handoff: null,
  repo: 'claudalisk',
  worktree: 'C:/git/claudalisk-16',
  branch: 'issue-16-work-issue',
  pr: { number: 9, url: 'u', state: 'OPEN', isDraft: false, headRefOid: SHA, hasReview: true, mergedAt: null, green: true },
  deployment: null,
  ...over,
});
const pr = (over) => ({ ...facts().pr, ...over });

test('slugify keeps four words', () => {
  assert.equal(slugify('work-issue skill and workflow: the full'), 'work-issue-skill-and');
  assert.equal(slugify('A very long title with many words!'), 'a-very-long-title');
});

test('isGreen reads CheckRun and StatusContext entries', () => {
  assert.equal(isGreen([check(), { __typename: 'StatusContext', state: 'SUCCESS', context: 'x' }]), true);
  assert.equal(isGreen([check({ conclusion: 'SKIPPED' })]), true);
  assert.equal(isGreen([check({ status: 'IN_PROGRESS', conclusion: '' })]), false);
  assert.equal(isGreen([check({ conclusion: 'FAILURE' })]), false);
  assert.equal(isGreen([{ __typename: 'StatusContext', state: 'PENDING' }]), false);
  assert.equal(isGreen([]), false);
  assert.equal(isGreen(null), false);
});

test('latestHandoff picks the newest comment starting with ## Handoff', () => {
  const comments = [
    { body: '## Handoff\nold', createdAt: '2026-01-01T00:00:00Z' },
    { body: 'chat', createdAt: '2026-03-01T00:00:00Z' },
    { body: '## Handoff\nnew', createdAt: '2026-02-01T00:00:00Z' },
  ];
  assert.equal(latestHandoff(comments).body, '## Handoff\nnew');
  assert.equal(latestHandoff([{ body: 'no', createdAt: 'x' }]), null);
  assert.equal(latestHandoff(undefined), null);
});

test('parseWorktrees maps paths to branches', () => {
  const text = 'worktree C:/a\nHEAD 1\nbranch refs/heads/main\n\nworktree C:/b\nHEAD 2\ndetached\n\nworktree C:/c\nHEAD 3\nbranch refs/heads/issue-1-x\n';
  assert.deepEqual(parseWorktrees(text), [{ path: 'C:/a', branch: 'main' }, { path: 'C:/b' }, { path: 'C:/c', branch: 'issue-1-x' }]);
});

test('needs-design-review is refused at step 1', () => {
  const r = lifecycleStep(facts({ issue: { number: 16, state: 'OPEN', title: 't', labels: ['needs-design-review'] } }));
  assert.equal(r.step, 1);
  assert.equal(r.blocked, true);
});

test('no branch gives the worktree command at step 2', () => {
  const r = lifecycleStep(facts({ branch: null, worktree: null, pr: null }));
  assert.equal(r.step, 2);
  assert.match(r.next, /git worktree add -b issue-16-work-issue-skill \.\.\/claudalisk-16 origin\/main/);
});

test('a branch without a pull request is steps 3 to 5', () => {
  assert.equal(lifecycleStep(facts({ pr: null })).step, 3);
  assert.match(lifecycleStep(facts({ pr: null, worktree: null })).next, /no worktree/);
});

test('a draft pull request is a CLA-0021 breach', () => {
  const r = lifecycleStep(facts({ pr: pr({ isDraft: true }) }));
  assert.equal(r.breach, 'CLA-0021');
  assert.equal(r.blocked, true);
});

test('CI that is not green is step 4', () => {
  assert.equal(lifecycleStep(facts({ pr: pr({ green: false }) })).step, 4);
});

test('a body without a review section is step 5', () => {
  assert.equal(lifecycleStep(facts({ pr: pr({ hasReview: false }) })).step, 5);
});

test('an undeployed head is step 6 with the exact command', () => {
  const r = lifecycleStep(facts());
  assert.equal(r.step, 6);
  assert.equal(r.next, 'node scripts/deploy.mjs --environment uat --confirm "deploy uat abcdef0"');
});

test('a deployed head without a later handoff is step 7', () => {
  const deployment = { sha: SHA, createdAt: '2026-02-01T00:00:00Z' };
  assert.equal(lifecycleStep(facts({ deployment })).step, 7);
  assert.equal(lifecycleStep(facts({ deployment, handoff: { createdAt: '2026-01-01T00:00:00Z', body: '## Handoff' } })).step, 7);
});

test('a handoff after the deployment waits on the owner at step 8', () => {
  const r = lifecycleStep(facts({ deployment: { sha: SHA, createdAt: '2026-02-01T00:00:00Z' }, handoff: { createdAt: '2026-02-02T00:00:00Z', body: '## Handoff' } }));
  assert.equal(r.step, 8);
  assert.equal(r.blocked, true);
  assert.ok(r.next.includes(`--since ${SHA}`));
});

test('a closed pull request stops at step 8', () => {
  const r = lifecycleStep(facts({ pr: pr({ state: 'CLOSED' }) }));
  assert.equal(r.step, 8);
  assert.equal(r.blocked, true);
});

test('a merged pull request prints the worktree removal and never runs it', () => {
  const merged = pr({ state: 'MERGED' });
  assert.equal(lifecycleStep(facts({ pr: merged })).next, 'git worktree remove C:/git/claudalisk-16');
  assert.match(lifecycleStep(facts({ pr: merged, worktree: null })).next, /Nothing to remove/);
});

test('formatText lists the step, the next action and the ADRs', () => {
  const f = facts({ pr: pr({ isDraft: true }) });
  const text = formatText(f, lifecycleStep(f));
  assert.match(text, /Step 6: Draft pull request \(stop\)/);
  assert.match(text, /Breach of CLA-0021/);
  assert.match(text, /Worktree: C:\/git\/claudalisk-16/);
});

test('parseArgs reads status, the issue, --app and --json', () => {
  assert.deepEqual(parseArgs(['status', '16', '--json', '--app', 'x']), { command: 'status', issue: 16, json: true, app: 'x' });
  assert.throws(() => parseArgs(['nope', '1']), /usage/);
  assert.throws(() => parseArgs(['status', 'x']), /issue number/);
  assert.throws(() => parseArgs(['status', '1', '--app']), /needs a value/);
  assert.throws(() => parseArgs(['status', '1', '--x']), /unknown option/);
});

const fakeRun = (answers) => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = [cmd, ...args].join(' ');
    const hit = Object.entries(answers).find(([k]) => key.startsWith(k));
    if (!hit) throw new Error(`unexpected ${key}`);
    return typeof hit[1] === 'string' ? hit[1] : JSON.stringify(hit[1]);
  };
  return { run, calls };
};

const issueView = { state: 'OPEN', title: 'Work issue skill', labels: [{ name: 'enhancement' }], comments: [{ body: '## Handoff\nx', createdAt: '2026-02-02T00:00:00Z' }, { body: 'hi', createdAt: '2026-02-03T00:00:00Z' }] };
const worktreeList = 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n\nworktree C:/git/claudalisk-16\nHEAD 2\nbranch refs/heads/issue-16-work-issue\n';
const prList = [{ number: 9, url: 'u', state: 'OPEN', isDraft: false, headRefOid: SHA, body: 'x\n## Review\n\nok', mergedAt: null, statusCheckRollup: [check()] }];

test('readFacts gathers the issue, worktree, pull request and deployment with read-only calls', () => {
  const { run, calls } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': worktreeList,
    'git for-each-ref': 'issue-16-work-issue\n',
    'gh pr list --head issue-16-work-issue --state all': prList,
    [`gh api repos/{owner}/{repo}/deployments?environment=uat&sha=${SHA}`]: [
      { sha: SHA, created_at: '2026-02-01T00:00:00Z' },
      { sha: SHA, created_at: '2026-02-01T05:00:00Z' },
    ],
  });
  const f = readFacts(16, run);
  assert.deepEqual(f.issue, { number: 16, state: 'OPEN', title: 'Work issue skill', labels: ['enhancement'] });
  assert.equal(f.handoff.createdAt, '2026-02-02T00:00:00Z');
  assert.equal(f.repo, 'claudalisk');
  assert.equal(f.worktree, 'C:/git/claudalisk-16');
  assert.equal(f.branch, 'issue-16-work-issue');
  assert.equal(f.pr.hasReview, true);
  assert.equal(f.pr.green, true);
  assert.deepEqual(f.deployment, { sha: SHA, createdAt: '2026-02-01T05:00:00Z' });
  assert.ok(calls.every(([cmd, ...a]) => (cmd === 'gh' && ['issue', 'pr', 'api'].includes(a[0])) || (cmd === 'git' && ['worktree', 'for-each-ref'].includes(a[0]))));
  assert.ok(!calls.some((c) => c.includes('--method') || c.includes('-X')));
});

test('readFacts with no branch makes no pull request call', () => {
  const { run, calls } = fakeRun({
    'gh issue view 16': { ...issueView, comments: [] },
    'git worktree list --porcelain': 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n',
    'git for-each-ref': '',
  });
  const f = readFacts(16, run);
  assert.equal(f.branch, null);
  assert.equal(f.pr, null);
  assert.equal(f.handoff, null);
  assert.equal(calls.length, 3);
  assert.equal(lifecycleStep(f).step, 2);
});

test('readFacts finds a branch without a worktree and a pull request without a deployment', () => {
  const { run } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n',
    'git for-each-ref': 'issue-16-other\n',
    'gh pr list --head issue-16-other': [{ ...prList[0], state: 'MERGED' }, { ...prList[0], number: 8, state: 'CLOSED' }],
    'gh api': [],
  });
  const f = readFacts(16, run);
  assert.equal(f.worktree, null);
  assert.equal(f.branch, 'issue-16-other');
  assert.equal(f.pr.state, 'MERGED');
  assert.equal(f.deployment, null);
});

test('readFacts reads a StatusContext rollup and a missing review section', () => {
  const { run } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': worktreeList,
    'git for-each-ref': '',
    'gh pr list': [{ ...prList[0], body: null, statusCheckRollup: [{ __typename: 'StatusContext', state: 'PENDING', context: 'c' }] }],
    'gh api': [],
  });
  const f = readFacts(16, run);
  assert.equal(f.pr.hasReview, false);
  assert.equal(f.pr.green, false);
  assert.equal(lifecycleStep(f).step, 4);
});
