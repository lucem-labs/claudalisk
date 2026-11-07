import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'workflows', 'implement-and-review.js'), 'utf8').replace(/\r\n/g, '\n');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const SHA = 'abcdef0123456789abcdef0123456789abcdef01';

const goodArgs = { issue: 16, worktree: 'C:/git/app-16', brief: 'C:/tmp/brief.md', pluginRoot: 'C:/plugin' };

const plan = (agents, domains, effort = 'medium') => ({
  round: 'full',
  highRisk: domains.some((d) => d.quorum),
  reasons: [],
  codeReview: { effort },
  agents,
  domains,
  unmapped: [],
});

const conformance = { name: 'adr-conformance', files: 2, adrs: 3, models: ['sonnet'], quorum: false };
const uatData = { name: 'uat-data', files: 1, adrs: 2, models: ['opus', 'sonnet', 'haiku'], quorum: true };

function fakes({ implement = { status: 'green', devVerified: true, head: SHA, report: 'done', questions: [] }, summary = plan([], []) } = {}) {
  const calls = [];
  const phases = [];
  const agent = async (prompt, options = {}) => {
    calls.push({ prompt, options });
    if (options.agentType === 'claudalisk:implementer') return implement;
    if (options.agentType === 'claudalisk:reviewer') return `report for ${prompt}`;
    return summary;
  };
  const parallel = async (thunks) => Promise.all(thunks.map(async (t) => { try { return await t(); } catch { return null; } }));
  const pipeline = async () => null;
  return { calls, phases, agent, parallel, pipeline, phase: (t) => phases.push(t), log: () => {} };
}

const run = (args, f = fakes()) => {
  const body = source.replace(/^export /m, '');
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', body);
  return fn(args, f.agent, f.parallel, f.pipeline, f.phase, f.log).then((result) => ({ result, f }));
};

test('meta is the first statement and a pure literal', () => {
  assert.match(source, /^export const meta = \{/);
  const literal = source.slice('export const '.length, source.indexOf('\n}\n') + 2);
  const meta = new Function(`${literal}; return meta;`)();
  assert.equal(meta.name, 'implement-and-review');
  assert.deepEqual(meta.phases.map((p) => p.title), ['Implement', 'Plan review', 'Review']);
  assert.ok(meta.description && meta.whenToUse);
  assert.doesNotMatch(literal, /[(`$]/);
});

test('the body uses no import, require, clock or randomness', () => {
  for (const banned of [/\bimport\b/, /\brequire\s*\(/, /Date\.now/, /Math\.random/, /new Date\(\s*\)/, /\bprocess\./]) {
    assert.doesNotMatch(source, banned);
  }
});

test('every agentType the workflow uses is an agent file of the plugin', () => {
  const types = [...source.matchAll(/agentType: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(types.length >= 2);
  for (const type of new Set(types)) {
    assert.match(type, /^claudalisk:/);
    assert.ok(existsSync(join(root, 'agents', `${type.slice('claudalisk:'.length)}.md`)), type);
  }
});

test('bad args throw', async () => {
  await assert.rejects(run({ ...goodArgs, issue: '16' }), /issue/);
  await assert.rejects(run({ ...goodArgs, worktree: '' }), /worktree/);
  await assert.rejects(run({ ...goodArgs, brief: undefined }), /brief/);
  await assert.rejects(run({ ...goodArgs, pluginRoot: ' ' }), /pluginRoot/);
  await assert.rejects(run({ ...goodArgs, since: 'not-a-sha' }), /since/);
  await assert.rejects(run(undefined), /issue/);
});

test('args may arrive as a JSON string', async () => {
  const { result } = await run(JSON.stringify(goodArgs));
  assert.equal(result.stage, 'reviewed');
});

test('the implementer gets the issue, the worktree and the brief', async () => {
  const { f } = await run(goodArgs);
  const first = f.calls[0];
  assert.equal(first.options.agentType, 'claudalisk:implementer');
  for (const part of ['#16', 'C:/git/app-16', 'C:/tmp/brief.md', 'dev', 'devVerified']) assert.ok(first.prompt.includes(part), part);
  assert.deepEqual(f.phases, ['Implement', 'Plan review', 'Review']);
});

test('a blocked, failed or null implementer stops early with its result', async () => {
  for (const implement of [{ status: 'green', devVerified: false, head: SHA, report: 'r', questions: [] }, { status: 'blocked', head: SHA, report: 'r', questions: ['which?'] }, { status: 'failed', head: SHA, report: 'r', questions: [] }, null]) {
    const { result, f } = await run(goodArgs, fakes({ implement }));
    assert.deepEqual(result, { stage: 'implement', implement });
    assert.equal(f.calls.length, 1);
  }
});

test('the plan agent runs fetch and review-plan at low effort, with --since when given', async () => {
  const { f } = await run(goodArgs);
  const planCall = f.calls[1];
  assert.equal(planCall.options.effort, 'low');
  assert.equal(planCall.options.model, 'haiku');
  assert.ok(planCall.prompt.includes('git fetch origin main'));
  assert.ok(planCall.prompt.includes('node "C:/plugin/tools/review-plan.mjs"'));
  assert.ok(!planCall.prompt.includes('--since'));
  assert.ok(planCall.prompt.includes('C:/git/app-16'));

  const withSince = await run({ ...goodArgs, since: SHA });
  assert.ok(withSince.f.calls[1].prompt.includes(`review-plan.mjs" --since ${SHA}`));
});

test('quorum reviewers get their model and medium effort, the others do not', async () => {
  const agents = [
    { domain: 'adr-conformance', model: 'sonnet', brief: '/b/adr-conformance.md' },
    { domain: 'uat-data', model: 'opus', brief: '/b/uat-data-opus.md' },
    { domain: 'uat-data', model: 'sonnet', brief: '/b/uat-data-sonnet.md' },
    { domain: 'uat-data', model: 'haiku', brief: '/b/uat-data-haiku.md' },
  ];
  const { result, f } = await run(goodArgs, fakes({ summary: plan(agents, [conformance, uatData], 'high') }));
  const reviewers = f.calls.filter((c) => c.options.agentType === 'claudalisk:reviewer');
  assert.equal(reviewers.length, 4);
  assert.equal('model' in reviewers[0].options, false);
  assert.equal('effort' in reviewers[0].options, false);
  assert.deepEqual(reviewers.slice(1).map((c) => [c.options.model, c.options.effort]), [['opus', 'medium'], ['sonnet', 'medium'], ['haiku', 'medium']]);
  assert.equal(reviewers[2].prompt, 'Review the brief at /b/uat-data-sonnet.md.');
  assert.equal(result.stage, 'reviewed');
  assert.equal(result.codeReviewEffort, 'high');
  assert.deepEqual(result.reviews.map((r) => [r.domain, r.model]), agents.map((a) => [a.domain, a.model]));
  assert.equal(result.reviews[0].report, 'report for Review the brief at /b/adr-conformance.md.');
  assert.equal(result.plan.highRisk, true);
});

test('no reviewer agents still returns the plan and the code review effort', async () => {
  const { result, f } = await run(goodArgs);
  assert.deepEqual(result.reviews, []);
  assert.equal(result.codeReviewEffort, 'medium');
  assert.equal(f.calls.length, 2);
});

test('a failed plan throws', async () => {
  const f = fakes();
  const agent = f.agent;
  f.agent = async (prompt, options = {}) => (options.effort === 'low' ? null : agent(prompt, options));
  await assert.rejects(run(goodArgs, f), /review plan/);
});

test('a reviewer that fails becomes a null report', async () => {
  const f = fakes({ summary: plan([{ domain: 'adr-conformance', model: 'sonnet', brief: '/b/x.md' }], [conformance]) });
  const agent = f.agent;
  f.agent = async (prompt, options = {}) => {
    if (options.agentType === 'claudalisk:reviewer') throw new Error('boom');
    return agent(prompt, options);
  };
  const { result } = await run(goodArgs, f);
  assert.equal(result.reviews[0].report, null);
});
