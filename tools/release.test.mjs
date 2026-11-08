import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseItems, main, registryItemNames, releaseItemUrls, releaseNotes, releaseTag, scriptsPackage } from './release.mjs';

function makeRepo({ version = '1.2.3', items = ['theme', 'base'], pkg } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'release-'));
  mkdirSync(join(root, '.claude-plugin'));
  writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claudalisk', version }));
  mkdirSync(join(root, 'registry'));
  writeFileSync(join(root, 'registry', 'registry.json'), JSON.stringify({ items: items.map((name) => ({ name })) }));
  if (pkg) {
    mkdirSync(join(root, 'packages', 'scripts'), { recursive: true });
    writeFileSync(join(root, 'packages', 'scripts', 'package.json'), JSON.stringify(pkg));
  }
  return root;
}

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const next = responses(url, calls.filter((call) => call === url).length);
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, text: async () => next.body };
  };
  return { impl, calls };
}

const noWait = { wait: async () => {}, delayMs: 0 };

test('the tag is v and the plugin version', () => {
  assert.equal(releaseTag('0.3.0'), 'v0.3.0');
});

test('item URLs point at the release tag', () => {
  assert.deepEqual(releaseItemUrls('0.3.0', ['theme']), [
    { name: 'theme', url: 'https://raw.githubusercontent.com/lucem-labs/claudalisk/v0.3.0/registry/public/r/theme.json' },
  ]);
});

test('item names come from registry.json and an empty registry is refused', (t) => {
  const root = makeRepo({ items: ['theme', 'base'] });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(registryItemNames(join(root, 'registry')), ['theme', 'base']);
  writeFileSync(join(root, 'registry', 'registry.json'), JSON.stringify({ items: [] }));
  assert.throws(() => registryItemNames(join(root, 'registry')), /no items/);
});

test('every item that resolves to its own JSON passes', async () => {
  const { impl } = fakeFetch((url) => ({ status: 200, body: JSON.stringify({ name: url.match(/r\/(.+)\.json$/)[1] }) }));
  assert.deepEqual(await checkReleaseItems('1.0.0', ['theme', 'base'], { fetchImpl: impl, ...noWait }), []);
});

test('a missing, broken or wrong item fails after the retries', async () => {
  const { impl, calls } = fakeFetch((url) => {
    if (url.endsWith('/theme.json')) return { status: 404, body: '404: Not Found' };
    if (url.endsWith('/base.json')) return { status: 200, body: 'not json' };
    if (url.endsWith('/job.json')) return { status: 200, body: JSON.stringify({ name: 'other' }) };
    return new Error('network down');
  });
  const failures = await checkReleaseItems('1.0.0', ['theme', 'base', 'job', 'pager'], { fetchImpl: impl, attempts: 3, ...noWait });
  assert.equal(failures.length, 4);
  assert.match(failures[0], /^theme: .* returned 404$/);
  assert.match(failures[1], /^base: .* is not JSON$/);
  assert.match(failures[2], /^job: .* holds the item "other"$/);
  assert.match(failures[3], /^pager: .* could not be fetched \(network down\)$/);
  assert.equal(calls.length, 12);
});

test('an item that appears late passes, and only failing items are fetched again', async () => {
  const waits = [];
  const { impl, calls } = fakeFetch((url, count) => {
    if (url.endsWith('/theme.json') && count < 3) return { status: 404, body: '' };
    return { status: 200, body: JSON.stringify({ name: url.match(/r\/(.+)\.json$/)[1] }) };
  });
  const failures = await checkReleaseItems('1.0.0', ['theme', 'base'], { fetchImpl: impl, wait: async (ms) => waits.push(ms), delayMs: 7 });
  assert.deepEqual(failures, []);
  assert.equal(calls.filter((url) => url.endsWith('/base.json')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('/theme.json')).length, 3);
  assert.deepEqual(waits, [7, 7]);
});

test('the scripts package is read only when it exists', (t) => {
  const without = makeRepo();
  const withPkg = makeRepo({ pkg: { name: '@claudalisk/scripts', version: '0.1.0' } });
  t.after(() => [without, withPkg].forEach((root) => rmSync(root, { recursive: true, force: true })));
  assert.equal(scriptsPackage(without), null);
  assert.deepEqual(scriptsPackage(withPkg), { name: '@claudalisk/scripts', version: '0.1.0', dir: 'packages/scripts' });
});

test('the notes name the registry URL and items, and the npm approval only with a package', () => {
  const plain = releaseNotes('1.2.3', ['theme'], null);
  assert.match(plain, /registry\/public\/r\/\{name\}\.json/);
  assert.match(plain, /v1\.2\.3/);
  assert.match(plain, /^- `theme`$/m);
  assert.doesNotMatch(plain, /npm/);
  const withPkg = releaseNotes('1.2.3', ['theme'], { name: '@claudalisk/scripts', version: '0.1.0' });
  assert.match(withPkg, /`@claudalisk\/scripts@0\.1\.0` is staged on npm .* awaits the owner's approval on npmjs\.com/);
});

test('the publish job stages the package, with an npm that has the stage command', () => {
  const workflow = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(workflow, /^ +npm stage publish --provenance --access public$/m);
  assert.doesNotMatch(workflow, /^ +npm publish\b/m);
  const [, major] = workflow.match(/npm install --global npm@(\d+)\./);
  assert.ok(Number(major) >= 12, major);
});

test('the command line prints the tag, checks the items and writes the notes', async (t) => {
  const root = makeRepo({ version: '2.0.0', items: ['theme'] });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = async (args, fetchImpl) => {
    let out = '';
    let err = '';
    const code = await main(args, { root, fetchImpl, out: (text) => { out += text; }, err: (text) => { err += text; }, checkOptions: { attempts: 1, ...noWait } });
    return { code, out, err };
  };
  assert.deepEqual(await run(['tag']), { code: 0, out: 'v2.0.0\n', err: '' });
  const good = fakeFetch(() => ({ status: 200, body: JSON.stringify({ name: 'theme' }) }));
  assert.equal((await run(['check'], good.impl)).code, 0);
  const bad = await run(['check'], fakeFetch(() => ({ status: 404, body: '' })).impl);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /1 registry item\(s\) do not resolve at v2\.0\.0/);
  assert.match((await run(['notes'])).out, /^Claudalisk 2\.0\.0/);
  assert.equal((await run(['other'])).code, 2);
});
