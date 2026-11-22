import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, highestVersion, isVersion, parseVersion } from './semver.mjs';

const valid = [
  '0.0.4',
  '1.2.3',
  '10.20.30',
  '1.1.2-prerelease',
  '1.0.0-alpha',
  '1.0.0-beta',
  '1.0.0-alpha.beta',
  '1.0.0-alpha.1',
  '1.0.0-alpha0.valid',
  '1.0.0-alpha.0valid',
  '1.0.0-rc.1',
  '2.0.0-rc.1',
  '1.2.3-beta',
  '10.2.3-DEV-SNAPSHOT',
  '1.2.3-SNAPSHOT-123',
  '1.0.0-0A.is.legal',
  '1.0.0-alpha-a.b-c-somethinglong',
  '1.2.3----RC-SNAPSHOT.12.9.1--.12',
  '1.0.0-0.3.7',
  '1.0.0-x.7.z.92',
  '99999999999999999999999.999999999999999999.99999999999999999',
  '0.1.0-alpha.4',
];

const invalid = [
  '1',
  '1.2',
  '1.2.3.4',
  '01.1.1',
  '1.01.1',
  '1.1.01',
  '1.2.3-0123',
  '1.2.3-0123.0123',
  '1.2.3-',
  '1.2.3-alpha..1',
  '1.2.3-alpha.',
  '1.2.3-al_pha',
  'v1.2.3',
  ' 1.2.3',
  '1.2.3 ',
  '1.2.3\n',
  '-1.0.0',
  '1.0.0+',
  'alpha',
  '',
  '1.2.x',
];

const withBuildMetadata = ['1.2.3+build', '1.0.0-alpha+001', '1.0.0+20130313144700', '1.0.0-beta+exp.sha.5114f85', '1.0.0+21AF26D3----117B344092BD'];

test('valid versions parse', () => {
  for (const version of valid) assert.equal(isVersion(version), true, version);
});

test('invalid versions are refused', () => {
  for (const version of invalid) {
    assert.equal(isVersion(version), false, JSON.stringify(version));
    assert.throws(() => parseVersion(version), /is not a Semantic Versioning 2\.0\.0 version/, JSON.stringify(version));
  }
});

test('a value that is not a string is refused', () => {
  for (const value of [undefined, null, 1, 1.2, {}, ['1.2.3']]) {
    assert.throws(() => parseVersion(value), /is not a Semantic Versioning 2\.0\.0 version/);
  }
});

test('build metadata is refused', () => {
  for (const version of withBuildMetadata) {
    assert.equal(isVersion(version), false, version);
    assert.throws(() => parseVersion(version), /carries build metadata/, version);
  }
});

test('a version parses into its parts', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1n, minor: 2n, patch: 3n, prerelease: [] });
  assert.deepEqual(parseVersion('0.1.0-alpha.4'), { major: 0n, minor: 1n, patch: 0n, prerelease: ['alpha', '4'] });
});

test('the precedence chain of the specification holds', () => {
  const ascending = [
    '0.1.0-alpha.4',
    '0.1.0-alpha.9',
    '0.1.0-alpha.10',
    '0.1.0',
    '0.1.1',
    '0.2.0',
    '0.10.0',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '2.0.0',
    '2.1.0',
    '2.1.1',
    '10.0.0',
  ];
  for (let low = 0; low < ascending.length; low += 1) {
    assert.equal(compareVersions(ascending[low], ascending[low]), 0, ascending[low]);
    for (let high = low + 1; high < ascending.length; high += 1) {
      assert.equal(compareVersions(ascending[low], ascending[high]), -1, `${ascending[low]} < ${ascending[high]}`);
      assert.equal(compareVersions(ascending[high], ascending[low]), 1, `${ascending[high]} > ${ascending[low]}`);
    }
  }
});

test('numeric identifiers compare as numbers and rank below alphanumeric ones', () => {
  assert.equal(compareVersions('1.0.0-2', '1.0.0-10'), -1);
  assert.equal(compareVersions('1.0.0-99', '1.0.0-a'), -1);
  assert.equal(compareVersions('1.0.0-a.2', '1.0.0-a.10'), -1);
  assert.equal(compareVersions('1.0.0-a10', '1.0.0-a2'), -1);
  assert.equal(compareVersions('1.0.0-A', '1.0.0-a'), -1);
});

test('numbers past the safe integer range still compare', () => {
  assert.equal(compareVersions('1.0.9007199254740993', '1.0.9007199254740992'), 1);
  assert.equal(compareVersions('1.0.0-rc.9007199254740993', '1.0.0-rc.9007199254740992'), 1);
});

test('comparing an invalid version throws', () => {
  assert.throws(() => compareVersions('1.2.3', '1.2'), /is not a Semantic Versioning/);
  assert.throws(() => compareVersions('1.2.3+build', '1.2.3'), /build metadata/);
});

test('the highest of a list is found, and an empty list has none', () => {
  assert.equal(highestVersion(['0.3.4', '0.10.0', '0.6.0', '0.10.0-rc.1']), '0.10.0');
  assert.equal(highestVersion([]), null);
});
