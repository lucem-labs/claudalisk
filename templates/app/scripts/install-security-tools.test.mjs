import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECURITY_TOOLS, UsageError, installTool, main, parseArgs } from './install-security-tools.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

function folder(t) {
  const path = mkdtempSync(join(tmpdir(), 'install-security-tools-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

const workFolders = () => readdirSync(tmpdir()).filter((name) => name.startsWith('security-tool-')).sort();

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
  assert.equal(parseArgs(['--tool', 'uv']).destination, undefined);
});

test('parseArgs refuses missing values and unknown arguments, with the usage line', () => {
  for (const argv of [[], ['--tool'], ['--tool', ' , '], ['--tool', 'uv', '--destination'], ['--tool', 'uv', '--force']]) {
    assert.throws(() => parseArgs(argv), (error) => error instanceof UsageError && /\nUsage: node scripts\/install-security-tools\.mjs/.test(error.message), argv.join(' '));
  }
});

test('installTool refuses an unknown tool, a prototype key among them, before downloading', async (t) => {
  for (const name of ['curl', 'constructor', '__proto__']) {
    let downloaded = false;
    await assert.rejects(installTool({ name, destination: folder(t), download: async () => { downloaded = true; } }), UsageError, name);
    assert.equal(downloaded, false, name);
  }
});

test('installTool refuses a download whose SHA-256 differs and installs nothing', async (t) => {
  const destination = join(folder(t), 'bin');
  const tools = { scanner: { url: 'https://example.invalid/scanner', sha256: sha256('expected'), binary: 'scanner' } };
  await assert.rejects(
    installTool({ name: 'scanner', destination, download: async () => Buffer.from('tampered'), tools }),
    /Checksum mismatch for scanner/,
  );
  assert.equal(existsSync(destination), false);
});

test('installTool copies a plain binary into the destination and makes it executable', async (t) => {
  const destination = join(folder(t), 'bin');
  const tools = { scanner: { url: 'https://example.invalid/scanner_linux_amd64', sha256: sha256('binary'), binary: 'scanner' } };
  const modes = [];
  const before = workFolders();
  const target = await installTool({ name: 'scanner', destination, download: async () => Buffer.from('binary'), chmod: (path, mode) => modes.push([path, mode]), tools });
  assert.equal(target, join(destination, 'scanner'));
  assert.equal(readFileSync(target, 'utf8'), 'binary');
  assert.deepEqual(modes, [[target, 0o755]]);
  assert.deepEqual(workFolders(), before);
});

test('installTool replaces a file already at the target', async (t) => {
  const destination = folder(t);
  writeFileSync(join(destination, 'scanner'), 'planted');
  const tools = { scanner: { url: 'https://example.invalid/scanner', sha256: sha256('binary'), binary: 'scanner' } };
  const target = await installTool({ name: 'scanner', destination, download: async () => Buffer.from('binary'), chmod: () => {}, tools });
  assert.equal(readFileSync(target, 'utf8'), 'binary');
});

test('installTool takes the binary out of the verified tarball', async (t) => {
  const destination = join(folder(t), 'bin');
  const tools = { scanner: { url: 'https://example.invalid/scanner.tar.gz', sha256: sha256('archive'), binary: 'scanner' } };
  const untarred = [];
  const untar = (archive, into) => {
    untarred.push(readFileSync(archive, 'utf8'));
    mkdirSync(join(into, 'scanner-1.0'));
    writeFileSync(join(into, 'scanner-1.0', 'scanner'), 'from the archive');
  };
  const target = await installTool({ name: 'scanner', destination, download: async () => Buffer.from('archive'), untar, chmod: () => {}, tools });
  assert.deepEqual(untarred, ['archive']);
  assert.equal(readFileSync(target, 'utf8'), 'from the archive');
});

test('installTool fails when the tarball lacks the binary and removes its work folder', async (t) => {
  const tools = { scanner: { url: 'https://example.invalid/scanner.tar.gz', sha256: sha256('archive'), binary: 'scanner' } };
  const before = workFolders();
  await assert.rejects(
    installTool({ name: 'scanner', destination: folder(t), download: async () => Buffer.from('archive'), untar: () => {}, tools }),
    /scanner is not in/,
  );
  assert.deepEqual(workFolders(), before);
});

test('main installs into a new folder under RUNNER_TEMP and adds it to GITHUB_PATH', async (t) => {
  const root = folder(t);
  const githubPath = join(root, 'github_path');
  const content = Buffer.from('binary');
  const io = { download: async () => content, untar: () => {}, chmod: () => {}, tools: { scanner: { url: 'https://example.invalid/scanner', sha256: sha256(content), binary: 'scanner' } } };
  const logs = [];
  const destination = await main(['--tool', 'scanner'], { env: { RUNNER_TEMP: root, GITHUB_PATH: githubPath }, log: (line) => logs.push(line), io });
  assert.match(destination, /security-tools-[^/\\]+$/);
  assert.equal(readFileSync(join(destination, 'scanner'), 'utf8'), 'binary');
  assert.equal(readFileSync(githubPath, 'utf8'), `${destination}\n`);
  assert.deepEqual(logs, [`Installed scanner at ${join(destination, 'scanner')}`]);
});

test('main leaves GITHUB_PATH alone when a tool fails its checksum', async (t) => {
  const root = folder(t);
  const githubPath = join(root, 'github_path');
  const io = { download: async () => Buffer.from('tampered'), untar: () => {}, tools: { scanner: { url: 'https://example.invalid/scanner', sha256: sha256('binary'), binary: 'scanner' } } };
  await assert.rejects(main(['--tool', 'scanner', '--destination', join(root, 'bin')], { env: { GITHUB_PATH: githubPath }, log: () => {}, io }), /Checksum mismatch/);
  assert.equal(existsSync(githubPath), false);
});
