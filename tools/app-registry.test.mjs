import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocatePorts, main, readRegistry, registerApp, registerProxy, registerRunners, registryPath } from './app-registry.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'app-registry.mjs');

const tempHome = () => mkdtempSync(join(tmpdir(), 'registry-home-'));

const config = (name, overrides = {}) => ({
  name,
  hostPrefix: name,
  repo: `acme/${name}`,
  databases: [{ role: 'app', envVar: 'DB' }],
  ports: { devDb: 5433, apiLocal: 5100 },
  uat: { composeProject: `${name}-uat`, volume: `${name}-uat-data` },
  ...overrides,
});

function appRootWith(value) {
  const root = mkdtempSync(join(tmpdir(), 'registry-app-'));
  if (value !== undefined) {
    mkdirSync(join(root, '.claude'));
    writeFileSync(join(root, '.claude', 'claudalisk.json'), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return root;
}

const text = (home) => readFileSync(registryPath({ home }), 'utf8');

test('registryPath is apps.json in the claudalisk folder', () => {
  assert.equal(registryPath({ home: '/h' }), join('/h', '.claudalisk', 'apps.json'));
});

test('an absent registry reads as no apps', () => {
  assert.deepEqual(readRegistry({ home: tempHome() }), { apps: [] });
});

test('a corrupt registry throws with its path instead of reading as empty', () => {
  const home = tempHome();
  mkdirSync(join(home, '.claudalisk'));
  writeFileSync(registryPath({ home }), '{ nope');
  assert.throws(() => readRegistry({ home }), (e) => e.message.includes(registryPath({ home })));
  assert.throws(() => registerApp(config('shop'), { home }), /apps\.json/);
});

test('a registry of the wrong shape throws with its path', () => {
  const home = tempHome();
  mkdirSync(join(home, '.claudalisk'));
  for (const body of ['[]', '{}', '{"apps":[{"name":"x"}]}', '{"apps":[],"proxy":{}}', '{"apps":[],"runners":1}']) {
    writeFileSync(registryPath({ home }), body);
    assert.throws(() => readRegistry({ home }), (e) => e.message.includes(registryPath({ home })), body);
  }
});

test('registerApp creates the folder and the entry', () => {
  const home = tempHome();
  registerApp(config('shop', { uat: { composeProject: 'shop-uat', volume: 'v', protectedVolumes: ['f'] } }), { home });
  assert.deepEqual(readRegistry({ home }), {
    apps: [{
      name: 'shop',
      repo: 'acme/shop',
      hostPrefix: 'shop',
      uat: { composeProject: 'shop-uat', volume: 'v', protectedVolumes: ['f'] },
      ports: { devDb: 5433, apiLocal: 5100 },
    }],
  });
});

test('registerApp upserts by name and accepts changed values', () => {
  const home = tempHome();
  registerApp(config('shop'), { home });
  registerApp(config('shop', { ports: { devDb: 5500, apiLocal: 5100 }, repo: 'acme/shop2' }), { home });
  const { apps } = readRegistry({ home });
  assert.equal(apps.length, 1);
  assert.equal(apps[0].ports.devDb, 5500);
  assert.equal(apps[0].repo, 'acme/shop2');
});

const clashCases = [
  ['repo', { repo: 'acme/shop' }, /repo acme\/shop/],
  ['hostPrefix', { hostPrefix: 'shop' }, /hostPrefix shop/],
  ['uat.composeProject', { uat: { composeProject: 'shop-uat', volume: 'other-v' } }, /uat\.composeProject shop-uat/],
  ['uat.volume', { uat: { composeProject: 'other-uat', volume: 'shop-uat-data' } }, /volume shop-uat-data/],
  ['a protected volume of the new app', { uat: { composeProject: 'other-uat', volume: 'other-v', protectedVolumes: ['shop-uat-data'] } }, /volume shop-uat-data/],
  ['devDb port', { ports: { devDb: 5433, apiLocal: 5101 } }, /port 5433/],
  ['apiLocal port', { ports: { devDb: 5434, apiLocal: 5100 } }, /port 5100/],
  ['port across roles', { ports: { devDb: 5100, apiLocal: 5101 } }, /port 5100/],
];

for (const [label, overrides, pattern] of clashCases) {
  test(`a clash on ${label} names both apps and writes nothing`, () => {
    const home = tempHome();
    registerApp(config('shop'), { home });
    const before = text(home);
    const other = config('blog', { hostPrefix: 'blog', repo: 'acme/blog', ports: { devDb: 5434, apiLocal: 5101 }, uat: { composeProject: 'blog-uat', volume: 'blog-v' }, ...overrides });
    assert.throws(() => registerApp(other, { home }), (e) => e.message.includes('blog') && e.message.includes('shop') && pattern.test(e.message));
    assert.equal(text(home), before);
    assert.deepEqual(readdirSync(join(home, '.claudalisk')), ['apps.json']);
  });
}

test('a uat volume that is another app\'s protected volume clashes', () => {
  const home = tempHome();
  registerApp(config('shop', { uat: { composeProject: 'shop-uat', volume: 'shop-v', protectedVolumes: ['old-data'] } }), { home });
  const other = config('blog', { hostPrefix: 'blog', repo: 'acme/blog', ports: { devDb: 5434, apiLocal: 5101 }, uat: { composeProject: 'blog-uat', volume: 'old-data' } });
  assert.throws(() => registerApp(other, { home }), /blog clashes with shop: volume old-data/);
});

test('protectedVolumes of the wrong type make the registry the wrong shape', () => {
  const home = tempHome();
  mkdirSync(join(home, '.claudalisk'));
  const app = { name: 'x', repo: 'a/x', hostPrefix: 'x', ports: { devDb: 5433, apiLocal: 5100 } };
  for (const protectedVolumes of ['old-data', [1], {}]) {
    writeFileSync(registryPath({ home }), JSON.stringify({ apps: [{ ...app, uat: { composeProject: 'p', volume: 'v', protectedVolumes } }] }));
    assert.throws(() => readRegistry({ home }), /protectedVolumes/);
  }
});

test('a write that would make the registry unreadable is refused and leaves the file', () => {
  const home = tempHome();
  registerApp(config('shop'), { home });
  const before = text(home);
  assert.throws(() => registerProxy({ composeProject: 'proxy' }, { home }), /refusing to write/);
  assert.throws(() => registerRunners({}, { home }), /refusing to write/);
  assert.equal(text(home), before);
  assert.doesNotThrow(() => readRegistry({ home }));
});

test('proxy and runners survive registering an app', () => {
  const home = tempHome();
  registerProxy({ composeProject: 'proxy', network: 'edge' }, { home });
  registerRunners({ composeProject: 'runners' }, { home });
  registerApp(config('shop'), { home });
  registerApp(config('blog', { hostPrefix: 'blog', repo: 'acme/blog', ports: { devDb: 5434, apiLocal: 5101 }, uat: { composeProject: 'b', volume: 'b' } }), { home });
  const registry = readRegistry({ home });
  assert.deepEqual(registry.proxy, { composeProject: 'proxy', network: 'edge' });
  assert.deepEqual(registry.runners, { composeProject: 'runners' });
  assert.deepEqual(registry.apps.map((a) => a.name), ['blog', 'shop']);
});

test('registering the proxy again replaces it and keeps the apps', () => {
  const home = tempHome();
  registerProxy({ composeProject: 'proxy', network: 'edge' }, { home });
  registerProxy({ composeProject: 'proxy2', network: 'edge2' }, { home });
  assert.deepEqual(readRegistry({ home }).proxy, { composeProject: 'proxy2', network: 'edge2' });
  assert.deepEqual(readRegistry({ home }).apps, []);
});

test('allocatePorts gives the bases on an empty registry', () => {
  assert.deepEqual(allocatePorts({ apps: [] }), { devDb: 5433, apiLocal: 5100 });
});

test('allocatePorts skips ports used in either role', () => {
  const registry = { apps: [
    { ports: { devDb: 5433, apiLocal: 5100 } },
    { ports: { devDb: 5434, apiLocal: 5433 } },
    { ports: { devDb: 5101, apiLocal: 5102 } },
  ] };
  assert.deepEqual(allocatePorts(registry), { devDb: 5435, apiLocal: 5103 });
});

test('allocatePorts never gives the same port twice and honours bases', () => {
  assert.deepEqual(allocatePorts({ apps: [] }, { devDbBase: 6000, apiLocalBase: 6000 }), { devDb: 6000, apiLocal: 6001 });
});

test('main registers the app and prints one line', () => {
  const home = tempHome();
  const lines = [];
  main(['register', appRootWith(config('shop'))], { home, write: (l) => lines.push(l) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /registered shop/);
  assert.equal(readRegistry({ home }).apps[0].name, 'shop');
});

const cli = (home, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });

test('the CLI registers an app and exits 0', () => {
  const home = tempHome();
  const result = cli(home, 'register', appRootWith(config('shop')));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(readRegistry({ home }).apps[0].name, 'shop');
});

test('the CLI exits 1 when the config is absent', () => {
  const home = tempHome();
  const result = cli(home, 'register', appRootWith());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /claudalisk\.json/);
});

test('the CLI exits 1 with the problem when the config is invalid', () => {
  const home = tempHome();
  const result = cli(home, 'register', appRootWith(config('shop', { name: '../evil' })));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\$\.name/);
});

test('the CLI exits 1 on a clash', () => {
  const home = tempHome();
  registerApp(config('shop'), { home });
  const result = cli(home, 'register', appRootWith(config('blog', { hostPrefix: 'blog', repo: 'acme/blog', uat: { composeProject: 'b', volume: 'b' } })));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clashes with shop/);
});
