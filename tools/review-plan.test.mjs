import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SECURITY,
  DEFAULT_UAT_DATA,
  globToRegExp,
  parseArgs,
  parseDiff,
  planReview,
  readAppConfig,
  readDeviations,
  readDiff,
  readKnowledge,
  writeBriefs,
} from './review-plan.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const knowledge = readKnowledge(pluginRoot);
const config = { uatData: DEFAULT_UAT_DATA, security: DEFAULT_SECURITY };

const change = (path, added = ['const x = 1;'], status = '') =>
  [
    `diff --git a/${path} b/${path}`,
    ...(status === 'added' ? ['new file mode 100644', '--- /dev/null'] : [`--- a/${path}`]),
    `+++ b/${path}`,
    `@@ -1,1 +1,${added.length + 1} @@`,
    ' unchanged',
    ...added.map((l) => `+${l}`),
  ].join('\n');

const plan = (...files) => planReview({ diff: files.join('\n'), knowledge, config });

function tempDir(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'review-plan-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('globs match like the skills paths', () => {
  assert.ok(globToRegExp('**/Migrations/**').test('backend/Mod/Migrations/2026_Init.cs'));
  assert.ok(globToRegExp('**/*.cs').test('Program.cs'));
  assert.ok(globToRegExp('frontend/src/**').test('frontend/src/pages/home/ui.tsx'));
  assert.ok(!globToRegExp('frontend/src/**').test('backend/src/a.cs'));
  assert.ok(globToRegExp('scripts/deploy*.mjs').test('scripts/deploy.mjs'));
  assert.ok(!globToRegExp('scripts/deploy*.mjs').test('scripts/lib/deploy.mjs'));
  assert.ok(globToRegExp('compose*uat*.yml').test('compose.uat.yml'));
});

test('the diff splits into files with their status and hunks', () => {
  const files = parseDiff([change('a.ts'), change('b/new.cs', ['x'], 'added')].join('\r\n'));
  assert.deepEqual(files.map((f) => [f.path, f.status]), [['a.ts', 'modified'], ['b/new.cs', 'added']]);
  assert.match(files[0].patch, /^diff --git a\/a\.ts b\/a\.ts\n/);
  assert.match(files[0].patch, /\+const x = 1;$/);
  assert.doesNotMatch(files[0].patch, /new\.cs/);
});

test('the knowledge comes from the real skills, with paths and ADRs', () => {
  const frontend = knowledge.find((s) => s.name === 'frontend');
  assert.ok(frontend.paths.includes('frontend/src/**'));
  assert.ok(frontend.adrs.some((a) => a.id === 'CLA-0014' && a.file.startsWith('adr/0014-')));
  assert.deepEqual(knowledge.find((s) => s.name === 'workflow').paths, []);
  const noComments = knowledge.find((s) => s.name === 'code-standards').adrs.find((a) => a.id === 'CLA-0035');
  assert.match(noComments.enforcedBy, /\S/);
});

test('a frontend-only change gets one Sonnet agent and a medium /code-review', () => {
  const p = plan(change('frontend/src/pages/home/ui/page.tsx'), change('frontend/src/entities/card/api.ts'));
  assert.equal(p.highRisk, false);
  assert.deepEqual(p.codeReview, { effort: 'medium' });
  assert.deepEqual(p.domains.map((d) => [d.name, d.models]), [['adr-conformance', ['sonnet']]]);
  assert.deepEqual(p.domains[0].skills, ['code-standards', 'frontend']);
  const ids = p.domains[0].adrs.map((a) => a.id);
  assert.ok(ids.includes('CLA-0014') && ids.includes('CLA-0035'));
  assert.ok(!ids.includes('CLA-0008'));
});

test('a change to the uat deploy script runs the quorum and a high /code-review', () => {
  const p = plan(change('scripts/deploy.mjs'));
  assert.equal(p.highRisk, true);
  assert.deepEqual(p.reasons, ['scripts/deploy.mjs: uat data']);
  assert.deepEqual(p.codeReview, { effort: 'high' });
  const uat = p.domains.find((d) => d.name === 'uat-data');
  assert.deepEqual(uat.models, ['opus', 'sonnet', 'haiku']);
  assert.equal(uat.quorum, true);
  assert.deepEqual(uat.skills, ['data-and-migrations', 'environments']);
  assert.ok(uat.adrs.some((a) => a.id === 'CLA-0030'));
  assert.ok(uat.adrs.some((a) => a.id === 'CLA-0031'));
  assert.deepEqual(p.domains.find((d) => d.name === 'adr-conformance').models, ['sonnet']);
});

test('a migration is uat data and is checked against the data ADRs', () => {
  const p = plan(change('backend/Modules/Cards/Cards.Persistence/Migrations/20261101_AddSet.cs', ['x'], 'added'));
  assert.equal(p.highRisk, true);
  assert.deepEqual(p.domains.map((d) => d.name), ['adr-conformance', 'uat-data']);
  assert.ok(p.domains[0].skills.includes('data-and-migrations'));
  assert.ok(p.domains[0].skills.includes('backend-architecture'));
  assert.equal(p.files[0].status, 'added');
});

test('the agent hooks of an app and of the plugin are uat data, and React hooks are not', () => {
  for (const path of ['hooks/guardrail.mjs', '.claude/hooks/guard.mjs']) {
    const p = plan(change(path));
    assert.equal(p.highRisk, true, path);
    assert.deepEqual(p.reasons, [`${path}: uat data`]);
    assert.deepEqual(p.domains.find((d) => d.name === 'uat-data').models, ['opus', 'sonnet', 'haiku']);
  }
  assert.equal(plan(change('frontend/src/shared/hooks/useCards.ts')).highRisk, false);
});

test('the scripts package and the template entry scripts are uat data, wherever they live', () => {
  for (const path of [
    'packages/scripts/src/migration-checks.mjs',
    'templates/app/scripts/deploy.mjs',
    'templates/app/scripts/init.mjs',
    'templates/app/scripts/migrate.mjs',
    'templates/app/scripts/backup.mjs',
    'templates/app/scripts/prune-backups.mjs',
    'templates/app/scripts/restore.mjs',
    'templates/app/scripts/refresh-dev.mjs',
    'scripts/deploy.mjs',
    'scripts/migrate.mjs',
    'compose.uat.yml',
  ]) {
    const p = plan(change(path));
    assert.equal(p.highRisk, true, path);
    assert.deepEqual(p.reasons, [`${path}: uat data`]);
  }
  assert.equal(plan(change('templates/app/scripts/verify.mjs')).highRisk, false);
});

test('a version change of the scripts package in package.json is uat data', () => {
  const bump = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -2,3 +2,3 @@',
    ' {',
    '-    "@claudalisk/scripts": "1.0.0",',
    '+    "@claudalisk/scripts": "1.1.0",',
    ' }',
  ].join('\n');
  const p = plan(bump);
  assert.equal(p.highRisk, true);
  assert.deepEqual(p.reasons, ['package.json: uat data']);
  assert.deepEqual(p.domains.find((d) => d.name === 'uat-data').models, ['opus', 'sonnet', 'haiku']);
});

test('a package.json change that leaves the scripts package alone is not uat data', () => {
  const nearby = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -2,3 +2,3 @@',
    '     "@claudalisk/scripts": "1.0.0",',
    '-    "react": "18.0.0",',
    '+    "react": "18.1.0",',
  ].join('\n');
  assert.equal(plan(nearby).highRisk, false);
  assert.equal(plan(change('notes/package.md', ['"@claudalisk/scripts": "1.0.0"'])).highRisk, false);
});

test('a security-relevant change is high-risk without a uat data quorum', () => {
  const p = plan(change('backend/Host/Authentication/JwtSetup.cs'));
  assert.equal(p.highRisk, true);
  assert.deepEqual(p.codeReview, { effort: 'high' });
  assert.deepEqual(p.domains.map((d) => [d.name, d.models]), [['adr-conformance', ['sonnet']]]);
});

test('lock files are skipped and unmapped files are listed', () => {
  const p = plan(change('frontend/package-lock.json'), change('README.md'), change('frontend/src/app/main.tsx'));
  assert.deepEqual(p.skipped, ['frontend/package-lock.json']);
  assert.deepEqual(p.unmapped, ['README.md']);
  assert.doesNotMatch(p.domains[0].patch, /package-lock|README/);
});

test('a fix round reviews only the domains its diff touches', () => {
  const p = planReview({ diff: change('frontend/src/app/main.tsx'), knowledge, config, round: 'fix' });
  assert.equal(p.round, 'fix');
  assert.deepEqual(p.domains.map((d) => d.name), ['adr-conformance']);
});

test('the app config adds its own uat data and security paths', () => {
  const root = tempDir({ '.claude/claudalisk.json': JSON.stringify({ name: 'app', review: { uatData: ['tools/db/**'], security: ['backend/Secrets/**'] } }) });
  try {
    const appConfig = readAppConfig(root);
    assert.ok(appConfig.uatData.includes('**/Migrations/**') && appConfig.uatData.includes('tools/db/**'));
    const p = planReview({ diff: change('tools/db/wipe.mjs'), knowledge, config: appConfig });
    assert.deepEqual(p.domains.find((d) => d.name === 'uat-data').models, ['opus', 'sonnet', 'haiku']);
  } finally { rmSync(root, { recursive: true, force: true }); }
  assert.deepEqual(readAppConfig(tmpdir()).uatData, DEFAULT_UAT_DATA);
});

test('an app config with a BOM is read', () => {
  const root = tempDir({ '.claude/claudalisk.json': `﻿${JSON.stringify({ review: { uatData: ['tools/db/**'] } })}` });
  try {
    assert.ok(readAppConfig(root).uatData.includes('tools/db/**'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the deviations section of AGENTS.md is read', () => {
  const root = tempDir({ 'AGENTS.md': '# App\n\n## Deviations\n\n- CLA-0035: generated files keep their header.\n\n### Backend\n\n- CLA-0069: one mapper.\n\n## Commands\n\n- npm test\n' });
  const nested = tempDir({ 'AGENTS.md': '# App\n\n## Rules\n\n### Deviations\n\n- CLA-0035: kept.\n\n### Commands\n\n- npm test\n' });
  try {
    assert.equal(readDeviations(root), '- CLA-0035: generated files keep their header.\n\n### Backend\n\n- CLA-0069: one mapper.');
    assert.equal(readDeviations(nested), '- CLA-0035: kept.');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(nested, { recursive: true, force: true });
  }
  assert.equal(readDeviations(join(tmpdir(), 'no-such-app')), '');
});

test('briefs carry the ADRs, the deviations and only their own hunks', () => {
  const out = tempDir();
  try {
    const p = planReview({
      diff: [change('scripts/deploy.mjs', ['restoreOver(uat);']), change('frontend/src/app/main.tsx', ['useEffect(() => fetch("/api"));'])].join('\n'),
      knowledge,
      config,
      deviations: '- CLA-0035: generated files keep their header.',
    });
    const summary = writeBriefs(p, out, pluginRoot);
    assert.deepEqual(summary.agents.map((a) => `${a.domain}/${a.model}`), ['adr-conformance/sonnet', 'uat-data/opus', 'uat-data/sonnet', 'uat-data/haiku']);
    assert.ok(existsSync(join(out, 'plan.json')));
    const uat = readFileSync(join(out, 'uat-data-haiku.md'), 'utf8');
    assert.match(uat, /^# Review brief: uat-data \(haiku\)/);
    assert.match(uat, /quorum reviewers/);
    assert.match(uat, /restoreOver\(uat\)/);
    assert.doesNotMatch(uat, /useEffect/);
    assert.match(uat, /- CLA-0030 \(`.+0030-[^`]+\.md`\): /);
    const conformance = readFileSync(join(out, 'adr-conformance.md'), 'utf8');
    assert.match(conformance, /generated files keep their header/);
    assert.match(conformance, /useEffect/);
    writeFileSync(join(out, 'notes.txt'), 'keep');
    const fix = writeBriefs(planReview({ diff: change('frontend/src/app/main.tsx'), knowledge, config, round: 'fix' }), out, pluginRoot);
    assert.deepEqual(fix.agents.map((a) => a.domain), ['adr-conformance']);
    assert.ok(!existsSync(join(out, 'uat-data-opus.md')));
    assert.ok(existsSync(join(out, 'notes.txt')));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('arguments pick the diff source', () => {
  assert.deepEqual(parseArgs([]), { base: 'origin/main', head: 'HEAD' });
  assert.throws(() => parseArgs(['--nope', 'x']), /unknown option/);
  assert.throws(() => parseArgs(['--pr']), /needs a value/);
  const calls = [];
  const run = (cmd, a) => { calls.push([cmd, ...a].join(' ')); return ''; };
  readDiff(parseArgs([]), run);
  readDiff(parseArgs(['--since', 'abc123']), run);
  readDiff(parseArgs(['--pr', '42']), run);
  assert.deepEqual(calls, [
    'git -c core.quotePath=false diff --no-color --no-ext-diff --find-renames origin/main...HEAD',
    'git -c core.quotePath=false diff --no-color --no-ext-diff --find-renames abc123...HEAD',
    'gh pr diff 42',
  ]);
  assert.deepEqual(parseArgs(['--pr', '7', '--comment']), { base: 'origin/main', head: 'HEAD', pr: '7' });
  assert.throws(() => parseArgs(['--base', '--pr', '7']), /needs a value/);
});

test('paths with spaces, quotes and renames come from the file lines', () => {
  const diff = [
    'diff --git a/docs/a b/c.md b/docs/a b/c.md',
    '--- a/docs/a b/c.md',
    '+++ b/docs/a b/c.md',
    '@@ -1 +1 @@',
    '+--- not a header',
    'diff --git "a/frontend/src/\\303\\274.tsx" "b/frontend/src/\\303\\274.tsx"',
    '--- "a/frontend/src/q\\"x.tsx"',
    '+++ "b/frontend/src/q\\"x.tsx"',
    '@@ -1 +1 @@',
    '+x',
    'diff --git a/scripts/old.mjs b/scripts/deploy.mjs',
    'similarity index 90%',
    'rename from scripts/old.mjs',
    'rename to scripts/deploy.mjs',
  ].join('\n');
  const files = parseDiff(diff);
  assert.deepEqual(files.map((f) => [f.path, f.status]), [
    ['docs/a b/c.md', 'modified'],
    ['frontend/src/q"x.tsx', 'modified'],
    ['scripts/deploy.mjs', 'renamed'],
  ]);
  assert.equal(files[2].oldPath, 'scripts/old.mjs');
});

test('uat data and security paths match regardless of case, and Author is not auth', () => {
  assert.equal(plan(change('frontend/src/features/auth/session.ts')).highRisk, true);
  assert.equal(plan(change('backend/Modules/Identity/Identity/Features/SignIn/SignIn.cs')).highRisk, true);
  assert.equal(plan(change('backend/Modules/Authors/Authors/Features/GetAuthor/GetAuthor.cs')).highRisk, false);
  assert.equal(plan(change('Scripts/Deploy.mjs')).highRisk, true);
});

test('a plan with no reviewer domains still runs /code-review', () => {
  const p = plan(change('README.md'));
  assert.deepEqual(p.domains, []);
  assert.deepEqual(p.codeReview, { effort: 'medium' });
});
