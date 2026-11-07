import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageError, buildImages, main, parseArgs, parseImage, runner, scanSavedImages } from './scan-images.mjs';

const root = join('repo');
const work = join('work');
const images = [parseImage('api=backend/Shop.Api/Dockerfile'), parseImage('frontend=frontend/Dockerfile')];

function recorder(fail = () => false) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    return { code: fail(command, args) ? 1 : 0 };
  };
  return { calls, run };
}

test('parseImage takes the build context from the Dockerfile folder at the root', () => {
  assert.deepEqual(parseImage('api=backend/Shop.Api/Dockerfile'), { tag: 'api:security', dockerfile: 'backend/Shop.Api/Dockerfile', context: 'backend' });
  assert.deepEqual(parseImage('frontend=frontend/Dockerfile'), { tag: 'frontend:security', dockerfile: 'frontend/Dockerfile', context: 'frontend' });
});

test('parseImage refuses a Dockerfile outside backend/ and frontend/', () => {
  for (const value of ['api=Dockerfile', 'api=../other/Dockerfile', 'api=backend/../../x/Dockerfile', 'api=backend/./Dockerfile', 'api=backend//Dockerfile', 'Api=backend/Dockerfile', undefined]) {
    assert.throws(() => parseImage(value), UsageError, String(value));
  }
});

test('parseArgs needs a mode and an image, and names the usage', () => {
  assert.throws(() => parseArgs(['--image', 'api=backend/Dockerfile']), /\nUsage: node scripts\/scan-images\.mjs/);
  assert.throws(() => parseArgs(['--build']), UsageError);
  const options = parseArgs(['--build', '--scan', '--image', 'api=backend/Dockerfile']);
  assert.equal(options.build, true);
  assert.equal(options.scan, true);
  assert.equal(options.images.length, 1);
});

test('buildImages builds each image from its context, pulling the base images', () => {
  const { calls, run } = recorder();
  buildImages({ images, root, run });
  assert.deepEqual(calls, [
    ['docker', 'build', '--pull', '--tag', 'api:security', '--file', join(root, 'backend/Shop.Api/Dockerfile'), join(root, 'backend')],
    ['docker', 'build', '--pull', '--tag', 'frontend:security', '--file', join(root, 'frontend/Dockerfile'), join(root, 'frontend')],
  ]);
});

test('buildImages stops at the first failed build', () => {
  const { calls, run } = recorder((command, args) => args.includes('api:security'));
  assert.throws(() => buildImages({ images, root, run }), /Building api:security/);
  assert.equal(calls.length, 1);
});

test('scanSavedImages scans each image from a docker save archive', () => {
  const { calls, run } = recorder();
  scanSavedImages({ images, root, run, work });
  const archive = (name) => join(work, `${name}-security.tar`);
  const trivy = (name) => [
    'trivy', 'image', '--input', archive(name), '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--ignore-unfixed',
    '--ignorefile', join(root, '.trivyignore.yaml'), '--exit-code', '1',
  ];
  assert.deepEqual(calls, [
    ['docker', 'save', '--output', archive('api'), 'api:security'],
    trivy('api'),
    ['docker', 'save', '--output', archive('frontend'), 'frontend:security'],
    trivy('frontend'),
  ]);
});

test('scanSavedImages scans every image and then fails on the ones with findings', () => {
  const { calls, run } = recorder((command, args) => command === 'trivy' && args.includes(join(work, 'api-security.tar')));
  assert.throws(() => scanSavedImages({ images, root, run, work }), /vulnerabilities in api:security\.$/);
  assert.equal(calls.length, 4);
});

test('scanSavedImages stops when an image was not built', () => {
  const { calls, run } = recorder((command, args) => command === 'docker' && args[0] === 'save');
  assert.throws(() => scanSavedImages({ images, root, run, work }), /build it first with --build/);
  assert.equal(calls.length, 1);
});

test('main builds every image before it saves any, and each mode alone does only its part', () => {
  const kinds = (argv) => {
    const { calls, run } = recorder();
    main([...argv, '--image', 'api=backend/Dockerfile', '--image', 'web=frontend/Dockerfile'], { root, run, makeWork: () => mkdtempSync(join(tmpdir(), 'scan-images-test-')) });
    return calls.map((call) => `${call[0]} ${call[1]}`);
  };
  assert.deepEqual(kinds(['--build', '--scan']), ['docker build', 'docker build', 'docker save', 'trivy image', 'docker save', 'trivy image']);
  assert.deepEqual(kinds(['--scan']), ['docker save', 'trivy image', 'docker save', 'trivy image']);
  assert.deepEqual(kinds(['--build']), ['docker build', 'docker build']);
});

test('main removes its work folder when a scan fails', () => {
  const made = [];
  const makeWork = () => { const path = mkdtempSync(join(tmpdir(), 'scan-images-test-')); made.push(path); return path; };
  const { run } = recorder((command) => command === 'trivy');
  assert.throws(() => main(['--scan', '--image', 'api=backend/Dockerfile'], { root, run, makeWork }), /vulnerabilities/);
  assert.equal(made.length, 1);
  assert.equal(existsSync(made[0]), false);
});

test('runner reports a missing command and counts a signal kill as a failure', () => {
  assert.throws(() => runner(() => ({ error: new Error('ENOENT') }))('trivy', [], { inherit: true }), /trivy could not start: ENOENT/);
  assert.deepEqual(runner(() => ({ status: null, signal: 'SIGKILL' }))('docker', [], { inherit: true }), { code: 1 });
  assert.deepEqual(runner(() => ({ status: 0 }))('docker', [], { inherit: true }), { code: 0 });
});
