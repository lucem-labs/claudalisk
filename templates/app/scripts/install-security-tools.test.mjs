import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECURITY_TOOLS, UsageError, installTool, parseArgs } from './install-security-tools.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const folder = () => mkdtempSync(join(tmpdir(), 'install-security-tools-test-'));

test('every tool is a pinned release with a SHA-256', () => {
  for (const [name, tool] of Object.entries(SECURITY_TOOLS)) {
    assert.match(tool.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/v?\d+\.\d+\.\d+\//, name);
    assert.match(tool.sha256, /^[0-9a-f]{64}$/, name);
  }
});

test('parseArgs reads comma-separated and repeated --tool values', () => {
  const options = parseArgs(['--tool', 'gitleaks, trivy', '--tool', 'uv', '--destination', '/tmp/tools']);
  assert.deepEqual(options.tools, ['gitleaks', 'trivy', 'uv']);
  assert.equal(options.destination, '/tmp/tools');
});

test('parseArgs refuses no tool and unknown arguments', () => {
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(['--tool', 'uv', '--force']), UsageError);
});

test('installTool refuses an unknown tool before downloading', async () => {
  let downloaded = false;
  await assert.rejects(
    installTool({ name: 'curl', destination: folder(), download: async () => { downloaded = true; } }),
    UsageError,
  );
  assert.equal(downloaded, false);
});

test('installTool refuses a download whose SHA-256 differs and installs nothing', async () => {
  const destination = join(folder(), 'bin');
  const tools = { scanner: { url: 'https://example.invalid/scanner', sha256: sha256('expected'), binary: 'scanner' } };
  await assert.rejects(
    installTool({ name: 'scanner', destination, download: async () => Buffer.from('tampered'), tools }),
    /Checksum mismatch for scanner/,
  );
  assert.equal(existsSync(destination), false);
});

test('installTool copies a plain binary into the destination', async () => {
  const destination = join(folder(), 'bin');
  const tools = { scanner: { url: 'https://example.invalid/scanner_linux_amd64', sha256: sha256('binary'), binary: 'scanner' } };
  const target = await installTool({ name: 'scanner', destination, download: async () => Buffer.from('binary'), tools });
  assert.equal(target, join(destination, 'scanner'));
  assert.equal(readFileSync(target, 'utf8'), 'binary');
});

test('installTool takes the binary out of a tarball', async () => {
  const destination = join(folder(), 'bin');
  const tools = { scanner: { url: 'https://example.invalid/scanner.tar.gz', sha256: sha256('archive'), binary: 'scanner' } };
  const untarred = [];
  const untar = (archive, into) => {
    untarred.push(archive);
    mkdirSync(join(into, 'scanner-1.0'));
    writeFileSync(join(into, 'scanner-1.0', 'scanner'), 'from the archive');
  };
  const target = await installTool({ name: 'scanner', destination, download: async () => Buffer.from('archive'), untar, tools });
  assert.equal(untarred.length, 1);
  assert.match(untarred[0], /scanner\.tar\.gz$/);
  assert.equal(readFileSync(target, 'utf8'), 'from the archive');
});

test('installTool fails when the tarball lacks the binary', async () => {
  const tools = { scanner: { url: 'https://example.invalid/scanner.tar.gz', sha256: sha256('archive'), binary: 'scanner' } };
  await assert.rejects(
    installTool({ name: 'scanner', destination: folder(), download: async () => Buffer.from('archive'), untar: () => {}, tools }),
    /scanner is not in/,
  );
});
