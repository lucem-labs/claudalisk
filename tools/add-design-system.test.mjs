import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDesignSystem, githubToken, parseArgs, pinSkillText, skillFiles } from './add-design-system.mjs';
import { pluginVersion, releaseRegistryUrl, shadcnVersion } from './registry.mjs';

function app() {
  const root = mkdtempSync(join(tmpdir(), 'design-system-'));
  writeFileSync(join(root, 'package.json'), '{}');
  return root;
}

const offline = { token: () => undefined, strip: () => [], log: () => {} };

function fakeGitHub(files, status = 200) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, authorization: init?.headers?.Authorization });
    if (status !== 200) return new Response('', { status });
    if (url.includes('/commits/')) return Response.json({ sha: 'abc123' });
    if (url.includes('/git/trees/abc123')) {
      return Response.json({ tree: Object.keys(files).map((path) => ({ type: 'blob', path: `skills/shadcn/${path}` })) });
    }
    const path = url.split('/abc123/skills/shadcn/')[1];
    if (path in files) return new Response(files[path]);
    return new Response('', { status: 404 });
  };
  return { fetchImpl, requests };
}

test('parseArgs reads the app, the registry, --no-skill and --skill-only', () => {
  assert.deepEqual(parseArgs(['--app', 'frontend']), { app: 'frontend', registry: undefined, skill: true, skillOnly: false });
  assert.deepEqual(parseArgs(['--app', 'f', '--registry', 'http://x/{name}.json', '--no-skill']), {
    app: 'f',
    registry: 'http://x/{name}.json',
    skill: false,
    skillOnly: false,
  });
  assert.deepEqual(parseArgs(['--app', 'f', '--skill-only']), { app: 'f', registry: undefined, skill: true, skillOnly: true });
});

test('parseArgs refuses a missing app, an unknown argument and a registry without {name}', () => {
  assert.throws(() => parseArgs([]), /Usage/);
  assert.throws(() => parseArgs(['--app', 'f', '--force']), /Unknown argument/);
  assert.throws(() => parseArgs(['--app', 'f', '--registry', 'http://x/r']), /\{name\}/);
  assert.throws(() => parseArgs(['--app', 'f', '--skill-only', '--no-skill']), /cannot be combined/);
});

test('githubToken uses GITHUB_TOKEN, then gh auth token, then none', () => {
  const gh = (status, stdout) => () => ({ status, stdout });
  assert.equal(githubToken({ GITHUB_TOKEN: 'env' }, () => assert.fail('no gh')), 'env');
  assert.equal(githubToken({}, gh(0, 'from-gh\n')), 'from-gh');
  assert.equal(githubToken({}, gh(1, '')), undefined);
  assert.equal(githubToken({}, () => ({ status: null, error: new Error('ENOENT') })), undefined);
});

test('pinSkillText pins every shadcn@latest to the plugin version', () => {
  assert.equal(pinSkillText('Run `npx shadcn@latest add` or shadcn@latest info', '4.21.5'), 'Run `npx shadcn@4.21.5 add` or shadcn@4.21.5 info');
});

test('skillFiles takes the skill folder without its evals and agent configs', () => {
  const tree = [
    { type: 'blob', path: 'skills/shadcn/SKILL.md' },
    { type: 'blob', path: 'skills/shadcn/rules/forms.md' },
    { type: 'blob', path: 'skills/shadcn/evals/evals.json' },
    { type: 'blob', path: 'skills/shadcn/agents/openai.yml' },
    { type: 'tree', path: 'skills/shadcn/rules' },
    { type: 'blob', path: 'skills/other/SKILL.md' },
  ];
  assert.deepEqual(skillFiles(tree), ['SKILL.md', 'rules/forms.md']);
});

test('writes components.json, adds @claudalisk/base with the pinned CLI, strips comments and installs the pinned skill', async () => {
  const root = app();
  const runs = [];
  const stripped = [];
  const { fetchImpl, requests } = fakeGitHub({ 'SKILL.md': 'npx shadcn@latest info', 'rules/forms.md': 'forms' });
  try {
    await addDesignSystem(
      { app: root, registry: undefined, skill: true },
      { ...offline, run: async (...args) => runs.push(args), fetchImpl, token: () => 'secret', strip: (path) => stripped.push(path) && [] },
    );

    const config = JSON.parse(readFileSync(join(root, 'components.json'), 'utf8'));
    assert.deepEqual(config.registries, { '@claudalisk': releaseRegistryUrl(pluginVersion()) });
    assert.deepEqual(runs, [['npx', ['--yes', `shadcn@${shadcnVersion()}`, 'add', '@claudalisk/base', '--yes'], root]]);
    assert.equal(readFileSync(join(root, '.claude', 'skills', 'shadcn', 'SKILL.md'), 'utf8'), `npx shadcn@${shadcnVersion()} info`);
    assert.equal(readFileSync(join(root, '.claude', 'skills', 'shadcn', 'rules', 'forms.md'), 'utf8'), 'forms');
    assert.ok(requests[0].url.endsWith(`/commits/${encodeURIComponent(`shadcn@${shadcnVersion()}`)}`));
    assert.ok(requests.every((request) => request.authorization === 'Bearer secret'));
    assert.deepEqual(stripped, [root]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uses the given registry URL and skips the skill on request', async () => {
  const root = app();
  try {
    await addDesignSystem(
      { app: root, registry: 'http://127.0.0.1:1/{name}.json', skill: false },
      { ...offline, run: async () => {}, fetchImpl: async () => assert.fail('no network') },
    );
    assert.equal(JSON.parse(readFileSync(join(root, 'components.json'), 'utf8')).registries['@claudalisk'], 'http://127.0.0.1:1/{name}.json');
    assert.equal(existsSync(join(root, '.claude')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses an app that already has components.json, and changes nothing', async () => {
  const root = app();
  writeFileSync(join(root, 'components.json'), '{"mine":true}');
  try {
    await assert.rejects(
      addDesignSystem({ app: root, skill: true }, { ...offline, run: async () => assert.fail('no run'), fetchImpl: async () => assert.fail('no network') }),
      /already exists/,
    );
    assert.equal(readFileSync(join(root, 'components.json'), 'utf8'), '{"mine":true}');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a folder without package.json', async () => {
  const root = mkdtempSync(join(tmpdir(), 'design-system-'));
  try {
    await assert.rejects(addDesignSystem({ app: root, skill: false }, { ...offline, run: async () => {} }), /no package\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the shadcn tag has no skill', async () => {
  const root = app();
  const { fetchImpl } = fakeGitHub({ 'README.md': 'x' });
  try {
    await assert.rejects(
      addDesignSystem({ app: root, skill: true }, { ...offline, run: async () => assert.fail('no run'), fetchImpl }),
      /has no skills\/shadcn\/SKILL\.md/,
    );
    assert.equal(existsSync(join(root, 'components.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetches the skill before it writes anything, so a refused request leaves the app as it was', async () => {
  const root = app();
  const { fetchImpl } = fakeGitHub({}, 403);
  try {
    await assert.rejects(
      addDesignSystem({ app: root, skill: true }, { ...offline, run: async () => assert.fail('no run'), fetchImpl }),
      /returned 403; set GITHUB_TOKEN or sign in with gh auth login/,
    );
    assert.equal(existsSync(join(root, 'components.json')), false);
    assert.equal(existsSync(join(root, '.claude')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--skill-only adds only the skill to an app that has components.json', async () => {
  const root = app();
  writeFileSync(join(root, 'components.json'), '{"mine":true}');
  const { fetchImpl } = fakeGitHub({ 'SKILL.md': 'skill' });
  try {
    await addDesignSystem(
      { app: root, skill: true, skillOnly: true },
      { ...offline, run: async () => assert.fail('no run'), strip: () => assert.fail('no strip'), fetchImpl },
    );
    assert.equal(readFileSync(join(root, 'components.json'), 'utf8'), '{"mine":true}');
    assert.equal(readFileSync(join(root, '.claude', 'skills', 'shadcn', 'SKILL.md'), 'utf8'), 'skill');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--skill-only refuses an app without components.json', async () => {
  const root = app();
  try {
    await assert.rejects(
      addDesignSystem({ app: root, skill: true, skillOnly: true }, { ...offline, run: async () => {}, fetchImpl: async () => assert.fail('no network') }),
      /does not exist; run without --skill-only first/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
