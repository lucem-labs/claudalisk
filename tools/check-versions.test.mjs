import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkRelease, checkVersions, gitIn, isPackageContent, main, releasedVersions, remoteTags } from './check-versions.mjs';
import { repositoryRoot } from './registry.mjs';

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function setVersions(root, { plugin, scripts }) {
  if (plugin !== undefined) write(root, '.claude-plugin/plugin.json', JSON.stringify({ name: 'claudalisk', version: plugin }));
  if (scripts !== undefined) write(root, 'packages/scripts/package.json', JSON.stringify({ name: '@claudalisk/scripts', version: scripts }));
}

function makeRepo(t, { plugin = '0.6.0', scripts = '0.1.1', tags = ['v0.5.0', 'v0.6.0'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-versions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = gitIn(root);
  git(['init', '--quiet', '--initial-branch', 'main']);
  setVersions(root, { plugin, scripts: scripts ?? undefined });
  if (scripts !== null) {
    write(root, 'packages/scripts/src/deploy.mjs', 'export const deploy = 1\n');
    write(root, 'packages/scripts/src/deploy.test.mjs', 'export const tested = 1\n');
    write(root, 'packages/scripts/test/package.test.mjs', 'export const tested = 1\n');
    write(root, 'packages/scripts/README.md', 'Read me.\n');
  }
  commit(root, 'release');
  for (const tag of tags) git(['tag', tag]);
  return root;
}

function commit(root, message) {
  const git = gitIn(root);
  git(['add', '--all']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--message', message]);
}

function fakeRemote(tags) {
  return (args) => {
    assert.deepEqual(args, ['ls-remote', '--tags', '--refs', 'origin', 'refs/tags/v*']);
    return tags.map((tag, index) => `${String(index).padStart(40, '0')}\trefs/tags/${tag}\n`).join('');
  };
}

test('tags split into released versions and tags that are not versions', () => {
  assert.deepEqual(releasedVersions(['v0.1.0', 'v0.10.0-rc.1', 'v1', 'vnext', 'v01.0.0', 'v1.0.0+build']), {
    versions: ['0.1.0', '0.10.0-rc.1'],
    invalid: ['v1', 'vnext', 'v01.0.0', 'v1.0.0+build'],
  });
});

test('tests and the README are not package content, and everything else in the package is', () => {
  assert.equal(isPackageContent('packages/scripts/src/commands/deploy.mjs'), true);
  assert.equal(isPackageContent('packages/scripts/package.json'), true);
  assert.equal(isPackageContent('packages/scripts/LICENSE'), true);
  assert.equal(isPackageContent('packages/scripts/README.md'), false);
  assert.equal(isPackageContent('packages/scripts/src/commands/deploy.test.mjs'), false);
  assert.equal(isPackageContent('packages/scripts/test/exports.snapshot.json'), false);
  assert.equal(isPackageContent('packages/other/src/index.mjs'), false);
});

test('a repository at its last release passes', (t) => {
  assert.deepEqual(checkVersions(makeRepo(t)), []);
});

test('a plugin version above the last release passes, and the highest tag is the last release', (t) => {
  const root = makeRepo(t, { plugin: '0.10.0', tags: ['v0.9.0', 'v0.10.0-rc.1', 'v0.6.0'] });
  assert.deepEqual(checkVersions(root), []);
});

test('an invalid plugin version fails', (t) => {
  for (const plugin of ['0.06.0', '0.6', '0.6.0+build']) {
    const errors = checkVersions(makeRepo(t, { plugin }));
    assert.equal(errors.length, 1, plugin);
    assert.match(errors[0], /\.claude-plugin\/plugin\.json must have a version/);
  }
});

test('an invalid scripts package version fails', (t) => {
  const errors = checkVersions(makeRepo(t, { scripts: '0.1' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /packages\/scripts\/package\.json must have a version/);
});

test('a plugin version lower than the last release fails', (t) => {
  const errors = checkVersions(makeRepo(t, { plugin: '0.5.9' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /the plugin is at 0\.5\.9, lower than its last release v0\.6\.0/);
});

test('a scripts package version lower than at the last release fails', (t) => {
  const root = makeRepo(t);
  setVersions(root, { scripts: '0.1.0' });
  const errors = checkVersions(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@claudalisk\/scripts is at 0\.1\.0, lower than 0\.1\.1 at its last release v0\.6\.0/);
});

test('changed package content under an unchanged version fails, committed or not', (t) => {
  const root = makeRepo(t);
  write(root, 'packages/scripts/src/deploy.mjs', 'export const deploy = 2\n');
  write(root, 'packages/scripts/src/added.mjs', 'export const added = 1\n');
  const uncommitted = checkVersions(root);
  assert.equal(uncommitted.length, 1);
  assert.match(uncommitted[0], /differs from its last release v0\.6\.0 but is still at 0\.1\.1/);
  assert.match(uncommitted[0], /Changed: packages\/scripts\/src\/added\.mjs, packages\/scripts\/src\/deploy\.mjs$/);
  commit(root, 'change');
  assert.deepEqual(checkVersions(root), uncommitted);
});

test('changed package content under a higher version passes', (t) => {
  const root = makeRepo(t);
  write(root, 'packages/scripts/src/deploy.mjs', 'export const deploy = 2\n');
  setVersions(root, { scripts: '0.1.2' });
  commit(root, 'change');
  assert.deepEqual(checkVersions(root), []);
});

test('changed tests and README under an unchanged version pass', (t) => {
  const root = makeRepo(t);
  write(root, 'packages/scripts/src/deploy.test.mjs', 'export const tested = 2\n');
  write(root, 'packages/scripts/test/package.test.mjs', 'export const tested = 2\n');
  write(root, 'packages/scripts/test/exports.snapshot.json', '{}\n');
  write(root, 'packages/scripts/README.md', 'Read me again.\n');
  commit(root, 'tests');
  assert.deepEqual(checkVersions(root), []);
});

test('a package that the last release did not have passes', (t) => {
  const root = makeRepo(t, { scripts: null });
  setVersions(root, { scripts: '0.1.0' });
  write(root, 'packages/scripts/src/deploy.mjs', 'export const deploy = 1\n');
  assert.deepEqual(checkVersions(root), []);
});

test('a clone without release tags fails instead of passing unchecked', (t) => {
  const errors = checkVersions(makeRepo(t, { tags: [] }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no v<version> release tag is in this clone/);
});

test('a v tag that is not a version fails', (t) => {
  const errors = checkVersions(makeRepo(t, { tags: ['v0.6.0', 'v1'] }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /the tag v1 is not v<version>/);
});

test('remote tags are read from ls-remote', () => {
  assert.deepEqual(remoteTags(fakeRemote(['v0.5.0', 'v0.6.0'])), ['v0.5.0', 'v0.6.0']);
  assert.deepEqual(remoteTags(fakeRemote([])), []);
});

test('a release is refused unless the plugin version is higher than every tag', (t) => {
  const root = makeRepo(t, { plugin: '0.6.1', tags: [] });
  assert.deepEqual(checkRelease(root, { git: fakeRemote(['v0.5.0', 'v0.6.0', 'v0.6.1-rc.1']) }), []);
  assert.deepEqual(checkRelease(root, { git: fakeRemote([]) }), []);
  for (const tags of [['v0.6.1'], ['v0.5.0', 'v0.7.0', 'v0.10.0'], ['v1.0.0-alpha.1']]) {
    const errors = checkRelease(root, { git: fakeRemote(tags) });
    assert.equal(errors.length, 1, tags.join(' '));
    assert.match(errors[0], new RegExp(`the plugin version 0\\.6\\.1 is not higher than the existing tag ${tags.at(-1).replaceAll('.', '\\.')}`));
  }
});

test('a release is refused on an invalid version or a tag that is not a version', (t) => {
  const invalid = makeRepo(t, { plugin: '0.6', tags: [] });
  assert.match(checkRelease(invalid, { git: fakeRemote(['v0.5.0']) })[0], /must have a version/);
  const root = makeRepo(t, { plugin: '0.7.0', tags: [] });
  assert.match(checkRelease(root, { git: fakeRemote(['v0.6.0', 'vnext']) })[0], /the tag vnext is not v<version>/);
});

test('main prints the failures and exits 1, exits 0 when clean and 2 on an unknown argument', (t) => {
  const root = makeRepo(t, { plugin: '0.5.9' });
  const printed = [];
  const io = { root, out: (text) => printed.push(text), err: (text) => printed.push(text) };
  assert.equal(main([], io), 1);
  assert.match(printed.join(''), /✗ the plugin is at 0\.5\.9/);
  assert.equal(main(['--release'], { ...io, git: fakeRemote(['v0.5.0']) }), 0);
  assert.equal(main(['--other'], io), 2);
});

test('both workflows run the check where the tags are known', () => {
  const ci = readFileSync(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const adrs = ci.slice(ci.indexOf('  adrs:'), ci.indexOf('  template-workflows:'));
  assert.match(adrs, /fetch-depth: 0/);
  assert.match(adrs, /run: node tools\/check-versions\.mjs\n/);
  const release = readFileSync(join(repositoryRoot, '.github', 'workflows', 'release.yml'), 'utf8');
  const tagging = release.indexOf('git tag "$TAG"');
  const refusal = release.indexOf('node tools/check-versions.mjs --release');
  assert.ok(refusal > 0 && refusal < tagging);
});
