#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GREEN_CONCLUSIONS = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];
const HANDOFF = /^## Handoff/;
const REVIEW_SECTION = /^## Review\s*$/m;
const BRANCH_REF = /^refs\/heads\//;

export const slugify = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join('-')
    .slice(0, 40)
    .replace(/-+$/, '');

export function parseWorktrees(porcelain) {
  return porcelain
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map((block) => {
      const entry = {};
      for (const line of block.split('\n')) {
        if (line.startsWith('worktree ')) entry.path = line.slice(9);
        else if (line.startsWith('branch ')) entry.branch = line.slice(7).replace(BRANCH_REF, '');
      }
      return entry;
    })
    .filter((e) => e.path);
}

export function isGreen(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return false;
  return rollup.every((check) => {
    if (check.__typename === 'StatusContext') return check.state === 'SUCCESS';
    return check.status === 'COMPLETED' && GREEN_CONCLUSIONS.includes(check.conclusion);
  });
}

export function latestHandoff(comments) {
  const notes = (comments ?? []).filter((c) => HANDOFF.test((c.body ?? '').trimStart()));
  if (!notes.length) return null;
  return notes.reduce((a, b) => (Date.parse(b.createdAt) >= Date.parse(a.createdAt) ? b : a));
}

const pickPr = (prs) => prs.find((p) => p.state === 'OPEN') ?? prs.find((p) => p.state === 'MERGED') ?? prs[0] ?? null;
const json = (text) => JSON.parse(text);

export function readFacts(issue, run) {
  const view = json(run('gh', ['issue', 'view', String(issue), '--json', 'state,labels,title,comments']));
  const handoff = latestHandoff(view.comments);
  const worktrees = parseWorktrees(run('git', ['worktree', 'list', '--porcelain']));
  const prefix = `issue-${issue}-`;
  const worktree = worktrees.find((w) => w.branch?.startsWith(prefix)) ?? null;
  const branches = run('git', ['for-each-ref', '--format=%(refname:short)', `refs/heads/${prefix}*`]).split('\n').map((b) => b.trim()).filter(Boolean);
  const branch = worktree?.branch ?? branches[0] ?? null;

  let pr = null;
  let deployment = null;
  if (branch) {
    const prs = json(run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,url,state,isDraft,headRefOid,body,mergedAt,statusCheckRollup']));
    pr = pickPr(prs);
    if (pr) {
      const deployments = json(run('gh', ['api', `repos/{owner}/{repo}/deployments?environment=uat&sha=${pr.headRefOid}`]));
      const latest = deployments.reduce((a, b) => (!a || Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a), null);
      deployment = latest ? { sha: latest.sha, createdAt: latest.created_at } : null;
    }
  }

  return {
    issue: { number: issue, state: view.state, title: view.title, labels: (view.labels ?? []).map((l) => l.name) },
    handoff: handoff ? { createdAt: handoff.createdAt, body: handoff.body } : null,
    repo: basename(worktrees[0]?.path ?? ''),
    worktree: worktree?.path ?? null,
    branch,
    pr: pr && { number: pr.number, url: pr.url, state: pr.state, isDraft: pr.isDraft, headRefOid: pr.headRefOid, hasReview: REVIEW_SECTION.test(pr.body ?? ''), mergedAt: pr.mergedAt, green: isGreen(pr.statusCheckRollup) },
    deployment,
  };
}

export function lifecycleStep(facts) {
  const { issue, pr } = facts;
  const n = issue.number;
  if (issue.labels.includes('needs-design-review')) {
    return { step: 1, title: 'Check the issue', next: `Refuse: #${n} is labelled needs-design-review. Ask the owner to settle the design first.`, adrs: ['CLA-0073', 'CLA-0022'], blocked: true };
  }
  if (!facts.branch) {
    return {
      step: 2,
      title: 'Branch in the issue worktree',
      next: `git fetch origin main && git worktree add -b issue-${n}-${slugify(issue.title)} ../${facts.repo}-${n} origin/main`,
      adrs: ['CLA-0021'],
    };
  }
  if (!pr) {
    return {
      step: 3,
      title: 'Plan, implement, verify and review (steps 3 to 5)',
      next: `Work in ${facts.worktree ?? `branch ${facts.branch}, which has no worktree`}: write the brief, run the implementer, verify on dev, then review.`,
      adrs: ['CLA-0074', 'CLA-0080', 'CLA-0076', 'CLA-0077', 'CLA-0029', 'CLA-0023'],
    };
  }
  if (pr.state === 'MERGED') {
    return {
      step: 9,
      title: 'Clean up after the merge',
      next: facts.worktree ? `git worktree remove ${facts.worktree}` : 'Nothing to remove. File any bugs found along the way as issues.',
      adrs: ['CLA-0024', 'CLA-0066', 'CLA-0022'],
    };
  }
  if (pr.state === 'CLOSED') {
    return { step: 8, title: 'The pull request was closed without a merge', next: `Ask the owner about #${pr.number} before opening another.`, adrs: ['CLA-0024'], blocked: true };
  }
  if (pr.isDraft) {
    return { step: 6, title: 'Draft pull request', next: `#${pr.number} is a draft, which CLA-0021 forbids. Ask the owner how to replace it with a ready one.`, adrs: ['CLA-0021'], blocked: true, breach: 'CLA-0021' };
  }
  if (!pr.green) {
    return { step: 4, title: 'Verify', next: `CI is not green on ${pr.headRefOid.slice(0, 7)}. Run node scripts/verify.mjs in the worktree.`, adrs: ['CLA-0076', 'CLA-0077', 'CLA-0029'] };
  }
  if (!pr.hasReview) {
    return { step: 5, title: 'Review', next: `Run /claudalisk:review and put its result in a "## Review" section of #${pr.number}.`, adrs: ['CLA-0023'] };
  }
  if (!facts.deployment) {
    return { step: 6, title: 'Review-deploy uat', next: `node scripts/deploy.mjs --environment uat --confirm "deploy uat ${pr.headRefOid.slice(0, 7)}"`, adrs: ['CLA-0023', 'CLA-0030'] };
  }
  const handedOver = facts.handoff && Date.parse(facts.handoff.createdAt) > Date.parse(facts.deployment.createdAt);
  if (!handedOver) {
    return { step: 7, title: 'Hand over', next: `Post a "## Handoff" note on #${n} saying what uat runs and what to check, then stop.`, adrs: ['CLA-0073'] };
  }
  return {
    step: 8,
    title: 'Waiting on the owner',
    next: `Wait for the owner's review of #${pr.number}. After requested changes, push them, redeploy uat and run /claudalisk:review --since ${pr.headRefOid}.`,
    adrs: ['CLA-0023', 'CLA-0024'],
    blocked: true,
  };
}

export function formatText(facts, result) {
  const lines = [`Issue #${facts.issue.number}: ${facts.issue.title}`];
  if (facts.worktree) lines.push(`Worktree: ${facts.worktree} (${facts.branch})`);
  if (facts.pr) lines.push(`Pull request: #${facts.pr.number} ${facts.pr.state}${facts.pr.isDraft ? ' draft' : ''} ${facts.pr.url}`);
  lines.push(`Step ${result.step}: ${result.title}${result.blocked ? ' (stop)' : ''}`, `Next: ${result.next}`, `ADRs: ${result.adrs.join(', ')}`);
  if (result.breach) lines.push(`Breach of ${result.breach}`);
  return lines.join('\n');
}

export function parseArgs(argv) {
  const [command, issue, ...rest] = argv;
  if (command !== 'status') throw new Error('usage: work-issue.mjs status <issue> [--app <root>] [--json]');
  if (!/^\d+$/.test(issue ?? '')) throw new Error('status needs an issue number');
  const args = { command, issue: Number(issue), json: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') args.json = true;
    else if (rest[i] === '--app') {
      args.app = rest[++i];
      if (args.app === undefined || args.app.startsWith('--')) throw new Error('--app needs a value');
    } else throw new Error(`unknown option ${rest[i]}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const cwd = resolve(args.app ?? process.cwd());
    const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd });
    const facts = readFacts(args.issue, run);
    const result = lifecycleStep(facts);
    console.log(args.json ? JSON.stringify({ ...result, facts }, null, 2) : formatText(facts, result));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
