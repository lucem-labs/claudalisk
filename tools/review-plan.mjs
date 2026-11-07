#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAdrs, readSkills } from './check-adrs.mjs';

export const QUORUM = ['opus', 'sonnet', 'haiku'];
export const REVIEW_MODEL = 'sonnet';

export const DEFAULT_UAT_DATA = [
  '**/Migrations/**',
  '**/scripts/deploy*.mjs',
  '**/scripts/init*.mjs',
  '**/scripts/migrate*.mjs',
  '**/scripts/**/*backup*',
  '**/scripts/**/*restore*',
  '**/scripts/**/*refresh*',
  'packages/scripts/**',
  'compose*uat*.yml',
  '.claude/settings.json',
  '.claude/hooks/**',
  'hooks/**',
];

export const DEFAULT_SECURITY = [
  '**/auth/**',
  '**/*authentication*',
  '**/*authentication*/**',
  '**/*authorization*',
  '**/*authorization*/**',
  '**/identity/**',
  '.github/workflows/security.yml',
  '.zap/**',
];

const BRIEF_FILE = /^(adr-conformance|uat-data)(-[a-z]+)?.md$/;
const SKIPPED = [/(^|\/)package-lock\.json$/, /\.lock$/, /\.snap$/, /(^|\/)packages\.lock\.json$/];
const CHANGES_SCRIPTS_PACKAGE = /^[+-]\s*"@claudalisk\/scripts"\s*:/m;
const changesScriptsPackage = (f) => /(^|\/)package\.json$/.test(f.path) && CHANGES_SCRIPTS_PACKAGE.test(f.patch);
const SKILL_ADR_LINE = /^- \[(CLA-\d{4})\]\(\$\{CLAUDE_PLUGIN_ROOT\}\/adr\/([^)]+)\) \(([^)]+)\): (.+)$/;

export function globToRegExp(glob, flags = '') {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, flags);
}

export const matchesAny = (path, globs, flags = '') => globs.some((g) => globToRegExp(g, flags).test(path));

const unquote = (path) => (path.startsWith('"') ? JSON.parse(path) : path);
const sidePath = (line, side) => {
  const raw = unquote(line.slice(4).replace(/	.*$/, ''));
  return raw === '/dev/null' ? null : raw.slice(side.length + 1);
};

export function parseDiff(text) {
  const files = [];
  let current = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = { path: header?.[2] ?? null, oldPath: header?.[1] ?? null, status: 'modified', inHunk: false, lines: [line] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if (current.inHunk) continue;
    if (line.startsWith('@@')) { current.inHunk = true; continue; }
    if (line.startsWith('--- ')) current.oldPath = sidePath(line, 'a') ?? current.oldPath;
    else if (line.startsWith('+++ ')) current.path = sidePath(line, 'b') ?? current.path;
    else if (line.startsWith('rename to ')) current.path = unquote(line.slice(10));
    else if (line.startsWith('rename from ')) current.oldPath = unquote(line.slice(12));
    if (line.startsWith('new file mode')) current.status = 'added';
    else if (line.startsWith('deleted file mode')) current.status = 'deleted';
    else if (line.startsWith('rename from')) current.status = 'renamed';
  }
  return files.map(({ lines, inHunk, ...f }) => ({ ...f, patch: lines.join('\n').replace(/\n+$/, '') }));
}

function frontmatterList(text, key) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const block = fm.match(new RegExp(`^${key}:\\n((?:  - .+\\n?)+)`, 'm'))?.[1] ?? '';
  return [...block.matchAll(/^  - "?([^"\n]+?)"?$/gm)].map((m) => m[1]);
}

export function readKnowledge(pluginRoot) {
  const adrs = new Map(readAdrs(pluginRoot).map((a) => [a.file, a]));
  return readSkills(pluginRoot).map((s) => ({
    name: s.name,
    paths: frontmatterList(s.text, 'paths'),
    adrs: s.text.split('\n').map((l) => l.match(SKILL_ADR_LINE)).filter(Boolean).map(([, id, file, status, decision]) => ({
      id,
      file: `adr/${file}`,
      status,
      decision: decision.trim(),
      enforcedBy: adrs.get(file)?.text.match(/^- \*\*Enforced by:\*\* (.+)$/m)?.[1].trim() ?? '',
    })),
  }));
}

export function readAppConfig(appRoot) {
  const path = join(appRoot, '.claude', 'claudalisk.json');
  const review = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')).review ?? {} : {};
  return {
    uatData: [...DEFAULT_UAT_DATA, ...(review.uatData ?? [])],
    security: [...DEFAULT_SECURITY, ...(review.security ?? [])],
  };
}

export function readDeviations(appRoot) {
  const path = join(appRoot, 'AGENTS.md');
  if (!existsSync(path)) return '';
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} Deviations\b/.test(l));
  if (start < 0) return '';
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function unionAdrs(skills) {
  const byId = new Map();
  for (const s of skills) for (const a of s.adrs) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function planReview({ diff, knowledge, config, deviations = '', round = 'full' }) {
  const all = parseDiff(diff);
  const skipped = all.filter((f) => SKIPPED.some((r) => r.test(f.path))).map((f) => f.path);
  const files = all.filter((f) => !skipped.includes(f.path)).map((f) => {
    const paths = [f.path, f.oldPath].filter(Boolean);
    return {
      ...f,
      skills: knowledge.filter((s) => s.paths.length && paths.some((p) => matchesAny(p, s.paths))).map((s) => s.name),
      uatData: paths.some((p) => matchesAny(p, config.uatData, 'i')) || changesScriptsPackage(f),
      security: paths.some((p) => matchesAny(p, config.security, 'i')),
    };
  });

  const skillByName = new Map(knowledge.map((s) => [s.name, s]));
  const reasons = files.filter((f) => f.uatData || f.security).map((f) => `${f.path}: ${f.uatData ? 'uat data' : 'security-relevant'}`);
  const highRisk = reasons.length > 0;
  const domains = [];

  const conformance = files.filter((f) => f.skills.length);
  if (conformance.length) {
    const skills = [...new Set(conformance.flatMap((f) => f.skills))].sort();
    domains.push({
      name: 'adr-conformance',
      files: conformance.map((f) => f.path),
      skills,
      adrs: unionAdrs(skills.map((n) => skillByName.get(n))),
      models: [REVIEW_MODEL],
    });
  }

  const uat = files.filter((f) => f.uatData);
  if (uat.length) {
    const skills = ['data-and-migrations', 'environments'].filter((n) => skillByName.has(n));
    domains.push({
      name: 'uat-data',
      files: uat.map((f) => f.path),
      skills,
      adrs: unionAdrs(skills.map((n) => skillByName.get(n))),
      models: [...QUORUM],
    });
  }

  const patchByPath = new Map(files.map((f) => [f.path, f.patch]));
  return {
    round,
    highRisk,
    reasons,
    files: files.map(({ path, status, skills, uatData, security }) => ({ path, status, skills, uatData, security })),
    unmapped: files.filter((f) => !f.skills.length && !f.uatData).map((f) => f.path),
    skipped,
    codeReview: { effort: highRisk ? 'high' : 'medium' },
    domains: domains.map((d) => ({ ...d, quorum: d.models.length > 1, patch: d.files.map((p) => patchByPath.get(p)).join('\n') })),
    deviations,
  };
}

const TASK = {
  'adr-conformance': 'Check the hunks below, and the code directly around them, against the ADRs listed. Report each place the change breaks an ADR. If the change needs a decision no ADR makes, report it as a gap.',
  'uat-data': 'Check whether the hunks below can lose, corrupt or expose uat data: migrations that are not safe to apply or roll back, a deploy that can restore over newer data, a backup that is not taken or verified, a restore that is not swapped in safely, a guard or deny-list entry that is weakened. Check them against the ADRs listed too.',
};

export function brief(plan, domain, model, pluginRoot) {
  const adrs = domain.adrs.map((a) => `- ${a.id} (\`${join(pluginRoot, a.file)}\`): ${a.decision}${a.enforcedBy ? ` _Enforced by: ${a.enforcedBy}._` : ''}`);
  return [
    `# Review brief: ${domain.name} (${model})`,
    '',
    `Domain: ${domain.name}. Round: ${plan.round}. High-risk: ${plan.highRisk ? 'yes' : 'no'}.${domain.quorum ? ' This is one of three independent quorum reviewers; do not try to guess what the others report.' : ''}`,
    '',
    '## Task',
    '',
    TASK[domain.name],
    '',
    'Skip rules that the architecture tests, Steiger, oxlint, the no-comments check or CI enforce, while those checks are green: an ADR whose "Enforced by" names such a check needs review only for what the check cannot see.',
    '',
    '## ADRs',
    '',
    ...adrs,
    '',
    '## Deviations from AGENTS.md',
    '',
    plan.deviations || 'None listed.',
    '',
    '## Files',
    '',
    ...domain.files.map((p) => `- ${p}`),
    '',
    '## Diff',
    '',
    '```diff',
    domain.patch,
    '```',
    '',
  ].join('\n');
}

export function writeBriefs(plan, outDir, pluginRoot) {
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f === 'plan.json' || BRIEF_FILE.test(f)) rmSync(join(outDir, f));
  const agents = [];
  for (const d of plan.domains) {
    for (const model of d.models) {
      const path = join(outDir, `${d.name}${d.quorum ? `-${model}` : ''}.md`);
      writeFileSync(path, brief(plan, d, model, pluginRoot));
      agents.push({ domain: d.name, model, brief: path });
    }
  }
  const summary = {
    round: plan.round,
    highRisk: plan.highRisk,
    reasons: plan.reasons,
    codeReview: plan.codeReview,
    agents,
    domains: plan.domains.map(({ name, files, adrs, models, quorum }) => ({ name, files: files.length, adrs: adrs.length, models, quorum })),
    unmapped: plan.unmapped,
    skipped: plan.skipped,
    out: outDir,
  };
  writeFileSync(join(outDir, 'plan.json'), JSON.stringify({ ...summary, files: plan.files }, null, 2));
  return summary;
}

export function parseArgs(argv) {
  const args = { base: 'origin/main', head: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--comment') continue;
    const key = argv[i].replace(/^--/, '');
    if (!['base', 'head', 'pr', 'diff-file', 'since', 'out', 'app'].includes(key)) throw new Error(`unknown option ${argv[i]}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i - 1]} needs a value`);
    args[key] = value;
  }
  return args;
}

export function readDiff(args, run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: args.app })) {
  if (args['diff-file']) return readFileSync(args['diff-file'], 'utf8');
  if (args.pr) return run('gh', ['pr', 'diff', args.pr]);
  const base = args.since ?? args.base;
  return run('git', ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--find-renames', `${base}...${args.head}`]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    args.app = resolve(args.app ?? process.cwd());
    const pluginRoot = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
    const plan = planReview({
      diff: readDiff(args),
      knowledge: readKnowledge(pluginRoot),
      config: readAppConfig(args.app),
      deviations: readDeviations(args.app),
      round: args.since ? 'fix' : 'full',
    });
    const out = resolve(args.out ?? mkdtempSync(join(tmpdir(), 'claudalisk-review-')));
    console.log(JSON.stringify(writeBriefs(plan, out, pluginRoot), null, 2));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
