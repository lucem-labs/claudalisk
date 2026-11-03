import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { UsageError, buildImages, parseArgs, parseImage, scanImages } from './scan-images.mjs';

const root = join('repo');
const work = join('work');
const images = [parseImage('api=backend/Shop.Api/Dockerfile'), parseImage('frontend=frontend/Dockerfile')];

function recorder(codes = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    return { code: codes[`${command} ${args.at(-1)}`] ?? codes[`${command} ${args[2]}`] ?? 0 };
  };
  return { calls, run };
}

test('parseImage takes the build context from the Dockerfile folder at the root', () => {
  assert.deepEqual(parseImage('api=backend/Shop.Api/Dockerfile'), { tag: 'api:security', dockerfile: 'backend/Shop.Api/Dockerfile', context: 'backend' });
  assert.deepEqual(parseImage('frontend=frontend/Dockerfile'), { tag: 'frontend:security', dockerfile: 'frontend/Dockerfile', context: 'frontend' });
});

test('parseImage refuses a Dockerfile outside backend/ and frontend/', () => {
  assert.throws(() => parseImage('api=Dockerfile'), UsageError);
  assert.throws(() => parseImage('api=../other/Dockerfile'), UsageError);
  assert.throws(() => parseImage('Api=backend/Dockerfile'), UsageError);
  assert.throws(() => parseImage(undefined), UsageError);
});

test('parseArgs needs a mode and an image', () => {
  assert.throws(() => parseArgs(['--image', 'api=backend/Dockerfile']), UsageError);
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
  const { calls, run } = recorder({ [`docker ${join(root, 'backend')}`]: 1 });
  assert.throws(() => buildImages({ images, root, run }), /Building api:security/);
  assert.equal(calls.length, 1);
});

test('scanImages scans each image from a docker save archive', () => {
  const { calls, run } = recorder();
  scanImages({ images, root, run, work });
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

test('scanImages scans every image and then fails on the ones with findings', () => {
  const { calls, run } = recorder({ [`trivy ${join(work, 'api-security.tar')}`]: 1 });
  assert.throws(() => scanImages({ images, root, run, work }), /vulnerabilities in api:security\.$/);
  assert.equal(calls.length, 4);
});

test('scanImages stops when an image was not built', () => {
  const { calls, run } = recorder({ 'docker api:security': 1 });
  assert.throws(() => scanImages({ images, root, run, work }), /build it first with --build/);
  assert.equal(calls.length, 1);
});
