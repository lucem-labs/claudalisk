import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatText, isGreen, latestHandoff, lifecycleStep, parseArgs, parseWorktrees, readFacts, reviewedHead, slugify } from './work-issue.mjs';

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const check = (over = {}) => ({ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS', name: 'adrs', ...over });

const facts = (over = {}) => ({
  issue: { number: 16, state: 'OPEN', title: 'Work issue skill', labels: ['enhancement'] },
  handoff: null,
  repo: 'claudalisk',
  worktree: 'C:/git/claudalisk-16',
  branch: 'issue-16-work-issue',
  pr: { number: 9, url: 'u', state: 'OPEN', isDraft: false, headRefOid: SHA, hasReview: true, reviewedHead: SHA, mergedAt: null, green: true },
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

test('no review section, or one without a reviewed head, is a full review at step 5', () => {
  for (const over of [{ hasReview: false, reviewedHead: null }, { hasReview: true, reviewedHead: null }]) {
    const r = lifecycleStep(facts({ pr: pr(over) }));
    assert.equal(r.step, 5);
    assert.doesNotMatch(r.next, /--since/);
  }
});

test('a review of an older head is step 5 with --since', () => {
  const old = '1'.repeat(40);
  const r = lifecycleStep(facts({ pr: pr({ reviewedHead: old }) }));
  assert.equal(r.step, 5);
  assert.ok(r.next.includes(`--since ${old}`));
});

test('a review of the current head is not asked for again', () => {
  assert.equal(lifecycleStep(facts({ pr: pr({ reviewedHead: SHA.toUpperCase().toLowerCase() }) })).step, 6);
});

test('reviewedHead reads the line inside the Review section', () => {
  assert.deepEqual(reviewedHead(`x\n## Review\n\nReviewed head: ${SHA}\n\ntable`), { hasReview: true, reviewedHead: SHA });
  assert.deepEqual(reviewedHead(`## Review\r\nReviewed head: ${SHA.toUpperCase()}\r\n`), { hasReview: true, reviewedHead: SHA });
  assert.deepEqual(reviewedHead('## Review\n\nno line'), { hasReview: true, reviewedHead: null });
  assert.deepEqual(reviewedHead(`Reviewed head: ${SHA}`), { hasReview: false, reviewedHead: null });
  assert.deepEqual(reviewedHead('Reviewed head: short\n## Review\nReviewed head: abc'), { hasReview: true, reviewedHead: null });
  assert.deepEqual(reviewedHead(null), { hasReview: false, reviewedHead: null });
});

test('reviewedHead tolerates backticks and bold, rejects a short sha, and stops at the next heading', () => {
  assert.equal(reviewedHead(`## Review\n\nReviewed head: \`${SHA}\`\n`).reviewedHead, SHA);
  assert.equal(reviewedHead(`## Review\n\n**Reviewed head:** \`${SHA}\`\n`).reviewedHead, SHA);
  assert.equal(reviewedHead(`## Review\n\nReviewed head: **${SHA}**\n`).reviewedHead, SHA);
  assert.equal(reviewedHead('## Review\n\nReviewed head: `abcdef0`\n').reviewedHead, null);
  assert.equal(reviewedHead(`## Review\n\nnone\n\n## Notes\n\nReviewed head: ${SHA}\n`).reviewedHead, null);
  assert.equal(reviewedHead(`## Review\n\n### Detail\nReviewed head: ${SHA}\n\n## Notes\n`).reviewedHead, SHA);
});

test('a title with no ASCII letters falls back to work', () => {
  assert.equal(slugify('日本語 ???'), 'work');
  assert.match(lifecycleStep(facts({ branch: null, worktree: null, pr: null, issue: { number: 3, state: 'OPEN', title: '???', labels: [] } })).next, /-b issue-3-work /);
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
  assert.match(r.next, /step 5.*--since/);
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
const prList = [{ number: 9, url: 'u', state: 'OPEN', isDraft: false, headRefOid: SHA, body: `x\n## Review\n\nReviewed head: ${SHA}\n\nok`, mergedAt: null, statusCheckRollup: [check()] }];

test('readFacts gathers the issue, worktree, pull request and deployment with read-only calls', () => {
  const { run, calls } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': worktreeList,
    'git for-each-ref': 'issue-16-work-issue\n',
    'gh pr list --head issue-16-work-issue --state all': prList.map(({ number, state }) => ({ number, state, headRefName: 'issue-16-work-issue' })),
    'gh pr view 9': prList[0],
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
  assert.equal(f.pr.reviewedHead, SHA);
  assert.equal(f.pr.green, true);
  assert.deepEqual(f.deployment, { sha: SHA, createdAt: '2026-02-01T05:00:00Z' });
  assert.ok(calls.every(([cmd, ...a]) => (cmd === 'gh' && ['issue', 'pr', 'api'].includes(a[0])) || (cmd === 'git' && ['worktree', 'for-each-ref'].includes(a[0]))));
  assert.ok(!calls.some((c) => c.includes('--method') || c.includes('-X')));
});

test('readFacts with no branch and no pull request leads to step 2', () => {
  const { run, calls } = fakeRun({
    'gh issue view 16': { ...issueView, comments: [] },
    'git worktree list --porcelain': 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n',
    'git for-each-ref': '',
    'gh pr list --state all --limit 200': [{ ...prList[0], headRefName: 'issue-160-x' }],
  });
  const f = readFacts(16, run);
  assert.equal(f.branch, null);
  assert.equal(f.pr, null);
  assert.equal(f.handoff, null);
  assert.equal(calls.length, 4);
  assert.equal(lifecycleStep(f).step, 2);
});

test('readFacts finds a branch without a worktree and a pull request without a deployment', () => {
  const { run } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n',
    'git for-each-ref': 'issue-16-other\n',
    'gh pr list --head issue-16-other': [{ number: 9, state: 'MERGED', headRefName: 'issue-16-other' }, { number: 8, state: 'CLOSED', headRefName: 'issue-16-other' }],
    'gh pr view 9': { ...prList[0], state: 'MERGED' },
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
    'gh pr list': [{ number: 9, state: 'OPEN', headRefName: 'issue-16-work-issue' }],
    'gh pr view 9': { ...prList[0], body: null, statusCheckRollup: [{ __typename: 'StatusContext', state: 'PENDING', context: 'c' }] },
    'gh api': [],
  });
  const f = readFacts(16, run);
  assert.equal(f.pr.hasReview, false);
  assert.equal(f.pr.green, false);
  assert.equal(lifecycleStep(f).step, 4);
});

const mergedPr = { ...prList[0], number: 152, state: 'MERGED', headRefName: 'issue-7-migration-fingerprints', mergedAt: '2026-02-01T00:00:00Z' };
const noWorktrees = 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n';

test('a closed issue with a merged pull request and no worktree is step 9 with nothing to remove', () => {
  const { run } = fakeRun({
    'gh issue view 7': { ...issueView, state: 'CLOSED', comments: [], closedByPullRequestsReferences: [{ number: 152 }] },
    'git worktree list --porcelain': noWorktrees,
    'git for-each-ref': '',
    'gh pr list --state all --limit 200': [{ number: 3, state: 'OPEN', headRefName: 'other' }, { number: 152, state: 'MERGED', headRefName: 'issue-7-migration-fingerprints' }],
    'gh pr view 152': mergedPr,
  });
  const f = readFacts(7, run);
  assert.equal(f.branch, 'issue-7-migration-fingerprints');
  assert.equal(f.worktree, null);
  const r = lifecycleStep(f);
  assert.equal(r.step, 9);
  assert.match(r.next, /Nothing to remove/);
});

test('the closing pull request is found even when its branch has another name', () => {
  const { run } = fakeRun({
    'gh issue view 7': { ...issueView, state: 'CLOSED', comments: [], closedByPullRequestsReferences: [{ number: 152 }] },
    'git worktree list --porcelain': noWorktrees,
    'git for-each-ref': '',
    'gh pr list --state all --limit 200': [{ number: 152, state: 'MERGED', headRefName: 'renamed' }],
    'gh pr view 152': mergedPr,
  });
  assert.equal(readFacts(7, run).pr.number, 152);
});

test('a local worktree still wins for the path of a merged pull request', () => {
  const { run } = fakeRun({
    'gh issue view 16': { ...issueView, state: 'CLOSED' },
    'git worktree list --porcelain': worktreeList,
    'git for-each-ref': '',
    'gh pr list --head issue-16-work-issue': [{ number: 152, state: 'MERGED', headRefName: 'issue-16-work-issue' }],
    'gh pr view 152': mergedPr,
  });
  const f = readFacts(16, run);
  assert.equal(lifecycleStep(f).next, 'git worktree remove C:/git/claudalisk-16');
});

test('a closed issue with no pull request stops and never offers a branch', () => {
  const { run } = fakeRun({
    'gh issue view 9': { ...issueView, state: 'CLOSED', comments: [] },
    'git worktree list --porcelain': noWorktrees,
    'git for-each-ref': '',
    'gh pr list --state all --limit 200': [],
  });
  const r = lifecycleStep(readFacts(9, run));
  assert.equal(r.blocked, true);
  assert.match(r.next, /closed/);
  assert.doesNotMatch(r.next, /worktree add/);
});

test('with several local branches and no worktree, the one with a pull request wins and the list stays light', () => {
  const { run, calls } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n',
    'git for-each-ref': 'issue-16-a\nissue-16-b\n',
    'gh pr list --head': [],
    'gh pr list --state all --limit 200': [{ number: 9, state: 'OPEN', headRefName: 'issue-16-b' }],
    'gh pr view 9': prList[0],
    'gh api': [],
  });
  const f = readFacts(16, run);
  assert.equal(f.branch, 'issue-16-b');
  const list = calls.find((c) => c[1] === 'pr' && c[2] === 'list');
  assert.equal(list[list.indexOf('--json') + 1], 'number,state,headRefName');
});

test('with no worktree each local branch is asked for its pull request before the global list', () => {
  const { run, calls } = fakeRun({
    'gh issue view 16': issueView,
    'git worktree list --porcelain': 'worktree C:/git/claudalisk\nHEAD 1\nbranch refs/heads/main\n',
    'git for-each-ref': 'issue-16-a\nissue-16-b\n',
    'gh pr list --head issue-16-a': [],
    'gh pr list --head issue-16-b': [{ number: 9, state: 'MERGED', headRefName: 'issue-16-b' }],
    'gh pr view 9': { ...prList[0], state: 'MERGED' },
  });
  const f = readFacts(16, run);
  assert.equal(f.branch, 'issue-16-b');
  assert.equal(f.pr.number, 9);
  assert.ok(!calls.some((c) => c.includes('--limit')));
});
