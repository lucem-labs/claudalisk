import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDesignSystem, parseArgs, pinSkillText, skillFiles } from './add-design-system.mjs';
import { pluginVersion, releaseRegistryUrl, shadcnVersion } from './registry.mjs';

function app() {
  const root = mkdtempSync(join(tmpdir(), 'design-system-'));
  writeFileSync(join(root, 'package.json'), '{}');
  return root;
}

function fakeGitHub(files) {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
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

test('parseArgs reads the app, the registry and --no-skill', () => {
  assert.deepEqual(parseArgs(['--app', 'frontend']), { app: 'frontend', registry: undefined, skill: true });
  assert.deepEqual(parseArgs(['--app', 'f', '--registry', 'http://x/{name}.json', '--no-skill']), {
    app: 'f',
    registry: 'http://x/{name}.json',
    skill: false,
  });
});

test('parseArgs refuses a missing app, an unknown argument and a registry without {name}', () => {
  assert.throws(() => parseArgs([]), /Usage/);
  assert.throws(() => parseArgs(['--app', 'f', '--force']), /Unknown argument/);
  assert.throws(() => parseArgs(['--app', 'f', '--registry', 'http://x/r']), /\{name\}/);
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

test('writes components.json, adds @claudalisk/base with the pinned CLI and installs the pinned skill', async () => {
  const root = app();
  const runs = [];
  const { fetchImpl, requests } = fakeGitHub({ 'SKILL.md': 'npx shadcn@latest info', 'rules/forms.md': 'forms' });
  try {
    await addDesignSystem({ app: root, registry: undefined, skill: true }, { run: async (...args) => runs.push(args), fetchImpl, log: () => {} });

    const config = JSON.parse(readFileSync(join(root, 'components.json'), 'utf8'));
    assert.deepEqual(config.registries, { '@claudalisk': releaseRegistryUrl(pluginVersion()) });
    assert.deepEqual(runs, [['npx', ['--yes', `shadcn@${shadcnVersion()}`, 'add', '@claudalisk/base', '--yes'], root]]);
    assert.equal(readFileSync(join(root, '.claude', 'skills', 'shadcn', 'SKILL.md'), 'utf8'), `npx shadcn@${shadcnVersion()} info`);
    assert.equal(readFileSync(join(root, '.claude', 'skills', 'shadcn', 'rules', 'forms.md'), 'utf8'), 'forms');
    assert.ok(requests[0].endsWith(`/commits/${encodeURIComponent(`shadcn@${shadcnVersion()}`)}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uses the given registry URL and skips the skill on request', async () => {
  const root = app();
  try {
    await addDesignSystem(
      { app: root, registry: 'http://127.0.0.1:1/{name}.json', skill: false },
      { run: async () => {}, fetchImpl: async () => assert.fail('no network'), log: () => {} },
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
      addDesignSystem({ app: root, skill: true }, { run: async () => assert.fail('no run'), fetchImpl: async () => assert.fail('no network'), log: () => {} }),
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
    await assert.rejects(addDesignSystem({ app: root, skill: false }, { run: async () => {}, log: () => {} }), /no package\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the shadcn tag has no skill', async () => {
  const root = app();
  const { fetchImpl } = fakeGitHub({ 'README.md': 'x' });
  try {
    await assert.rejects(addDesignSystem({ app: root, skill: true }, { run: async () => {}, fetchImpl, log: () => {} }), /has no skills\/shadcn\/SKILL\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
