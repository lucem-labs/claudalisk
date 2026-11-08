import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECURITY_TOOLS, UsageError, download, installTool, main, parseArgs, installSecurityTools } from './install-security-tools.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

function folder(t) {
  const path = mkdtempSync(join(tmpdir(), 'install-security-tools-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}


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
  const workRoot = folder(t);
  const target = await installTool({ name: 'scanner', destination, download: async () => Buffer.from('binary'), chmod: (path, mode) => modes.push([path, mode]), tools, workRoot });
  assert.equal(target, join(destination, 'scanner'));
  assert.equal(readFileSync(target, 'utf8'), 'binary');
  assert.deepEqual(modes, [[target, 0o755]]);
  assert.deepEqual(readdirSync(workRoot), []);
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
  const workRoot = folder(t);
  await assert.rejects(
    installTool({ name: 'scanner', destination: folder(t), download: async () => Buffer.from('archive'), untar: () => {}, tools, workRoot }),
    /scanner is not in/,
  );
  assert.deepEqual(readdirSync(workRoot), []);
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

const RELEASE_URL = 'https://github.com/acme/scanner/releases/download/v1.2.3/scanner.tar.gz';

function fakeGitHub({ assets = [{ id: 77, name: 'scanner.tar.gz' }], releaseStatus = 200, assetStatus = 200 } = {}) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, headers: options?.headers });
    if (url.endsWith('/releases/tags/v1.2.3')) return new Response(JSON.stringify({ assets }), { status: releaseStatus });
    return new Response('asset bytes', { status: assetStatus });
  };
  return { calls, request };
}

test('download with a token fetches the release asset through the API by id', async () => {
  const { calls, request } = fakeGitHub();
  const content = await download(RELEASE_URL, { token: 'test-token', request });
  assert.equal(content.toString(), 'asset bytes');
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://api.github.com/repos/acme/scanner/releases/tags/v1.2.3',
    'https://api.github.com/repos/acme/scanner/releases/assets/77',
  ]);
  assert.equal(calls[1].headers.accept, 'application/octet-stream');
  assert.ok(calls.every(({ headers }) => headers.authorization === 'Bearer test-token'));
});

test('download repeats the API requests without credentials when GitHub refuses the token', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, authorization: options.headers.authorization });
    if (options.headers.authorization) return new Response('{"message":"IP allow list"}', { status: 403 });
    if (url.endsWith('/releases/tags/v1.2.3')) return new Response(JSON.stringify({ assets: [{ id: 77, name: 'scanner.tar.gz' }] }));
    return new Response('asset bytes');
  };
  const content = await download(RELEASE_URL, { token: 'test-token', request });
  assert.equal(content.toString(), 'asset bytes');
  assert.deepEqual(calls, [
    { url: 'https://api.github.com/repos/acme/scanner/releases/tags/v1.2.3', authorization: 'Bearer test-token' },
    { url: 'https://api.github.com/repos/acme/scanner/releases/tags/v1.2.3', authorization: undefined },
    { url: 'https://api.github.com/repos/acme/scanner/releases/assets/77', authorization: undefined },
  ]);
});

test('download without a token uses the public release URL and sends no credentials', async () => {
  const { calls, request } = fakeGitHub();
  await download(RELEASE_URL, { request });
  assert.deepEqual(calls, [{ url: RELEASE_URL, headers: undefined }]);
});

test('download keeps the token away from a URL that is not a GitHub release asset', async () => {
  const { calls, request } = fakeGitHub();
  await download('https://example.invalid/scanner', { token: 'test-token', request });
  assert.deepEqual(calls, [{ url: 'https://example.invalid/scanner', headers: undefined }]);
});

test('download names the URL when the release lookup, the asset name or the asset fetch fails', async () => {
  for (const [github, expected] of [
    [fakeGitHub({ releaseStatus: 404 }), /looking up the release returned HTTP 404/],
    [fakeGitHub({ assets: [{ id: 1, name: 'other' }] }), /no asset named scanner\.tar\.gz/],
    [fakeGitHub({ assetStatus: 504 }), /failed \(HTTP 504\)/],
  ]) {
    await assert.rejects(download(RELEASE_URL, { token: 'test-token', request: github.request, ...withoutWaiting() }), (error) => error.message.includes(RELEASE_URL) && expected.test(error.message));
  }
});

function withoutWaiting() {
  const delays = [];
  const logs = [];
  return { wait: async (delay) => { delays.push(delay); }, log: (line) => logs.push(line), delays, logs };
}

function respondingInTurn(...outcomes) {
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    const outcome = outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return outcome();
  };
  return { urls, request };
}

const status = (code) => () => new Response('', { status: code });
const bytes = () => new Response('asset bytes');
const release = () => new Response(JSON.stringify({ assets: [{ id: 77, name: 'scanner.tar.gz' }] }));

test('download succeeds after a transient 5xx, waiting longer before each attempt', async () => {
  const { urls, request } = respondingInTurn(status(504), status(502), status(500), bytes);
  const pause = withoutWaiting();
  const content = await download(RELEASE_URL, { request, ...pause });
  assert.equal(content.toString(), 'asset bytes');
  assert.equal(urls.length, 4);
  assert.equal(pause.delays.length, 3);
  assert.ok(pause.delays[0] < pause.delays[1] && pause.delays[1] < pause.delays[2]);
  assert.match(pause.logs[0], /HTTP 504.*Retrying in 5 seconds/);
});

test('download retries a network error', async () => {
  const { urls, request } = respondingInTurn(new TypeError('fetch failed'), bytes);
  const content = await download(RELEASE_URL, { request, ...withoutWaiting() });
  assert.equal(content.toString(), 'asset bytes');
  assert.equal(urls.length, 2);
});

test('download retries a body that breaks off', async () => {
  const broken = () => ({ ok: true, status: 200, arrayBuffer: async () => { throw new TypeError('terminated'); } });
  const { urls, request } = respondingInTurn(broken, bytes);
  const content = await download(RELEASE_URL, { request, ...withoutWaiting() });
  assert.equal(content.toString(), 'asset bytes');
  assert.equal(urls.length, 2);
});

test('download starts again from the release lookup when either API request has a 5xx', async () => {
  const { urls, request } = respondingInTurn(status(503), release, status(504), release, bytes);
  const content = await download(RELEASE_URL, { token: 'test-token', request, ...withoutWaiting() });
  assert.equal(content.toString(), 'asset bytes');
  const lookup = 'https://api.github.com/repos/acme/scanner/releases/tags/v1.2.3';
  const asset = 'https://api.github.com/repos/acme/scanner/releases/assets/77';
  assert.deepEqual(urls, [lookup, lookup, asset, lookup, asset]);
});

test('download gives up on a lasting outage after a bounded number of attempts, within a few minutes of waiting', async () => {
  const github = fakeGitHub({ assetStatus: 504 });
  const pause = withoutWaiting();
  await assert.rejects(download('https://example.invalid/scanner', { request: github.request, ...pause }), /failed \(HTTP 504\)/);
  assert.equal(github.calls.length, pause.delays.length + 1);
  const waited = pause.delays.reduce((sum, delay) => sum + delay, 0);
  assert.ok(waited >= 120_000 && waited <= 300_000, `waited ${waited} ms`);
});

test('download does not retry a 404', async () => {
  for (const options of [{}, { token: 'test-token' }]) {
    const { urls, request } = respondingInTurn(status(404));
    const pause = withoutWaiting();
    await assert.rejects(download(RELEASE_URL, { ...options, request, ...pause }), /404/);
    assert.equal(urls.length, 1);
    assert.deepEqual(pause.delays, []);
  }
});

test('a real download that retries still has its checksum checked, and a mismatch is not downloaded again', async (t) => {
  const { urls, request } = respondingInTurn(status(504), () => new Response('tampered'));
  const pause = withoutWaiting();
  const tools = { scanner: { url: 'https://example.invalid/scanner', sha256: sha256('binary'), binary: 'scanner' } };
  await assert.rejects(
    installTool({ name: 'scanner', destination: join(folder(t), 'bin'), download: (url) => download(url, { request, ...pause }), tools }),
    /Checksum mismatch for scanner/,
  );
  assert.equal(urls.length, 2);
  assert.equal(pause.delays.length, 1);
});

test('main hands GITHUB_TOKEN, or GH_TOKEN without it, to the download', async (t) => {
  for (const [env, expected] of [[{ GITHUB_TOKEN: 'a', GH_TOKEN: 'b' }, 'a'], [{ GH_TOKEN: 'b' }, 'b'], [{}, undefined]]) {
    const content = Buffer.from('binary');
    const seen = [];
    const io = { download: async (url, options) => { seen.push(options.token); return content; }, untar: () => {}, chmod: () => {}, tools: { scanner: { url: 'https://example.invalid/scanner', sha256: sha256(content), binary: 'scanner' } } };
    await main(['--tool', 'scanner', '--destination', folder(t)], { env, log: () => {}, io });
    assert.deepEqual(seen, [expected]);
  }
});

test('main hands its log to the download so retries show in the job output', async (t) => {
  const content = Buffer.from('binary');
  const logs = [];
  const log = (line) => logs.push(line);
  const io = { download: async (url, options) => { options.log('retrying'); return content; }, untar: () => {}, chmod: () => {}, tools: { scanner: { url: 'https://example.invalid/scanner', sha256: sha256(content), binary: 'scanner' } } };
  await main(['--tool', 'scanner', '--destination', folder(t)], { env: {}, log, io });
  assert.equal(logs[0], 'retrying');
});

test('the command refuses an unknown tool with a usage error that exits 2', async () => {
  await assert.rejects(installSecurityTools({ argv: ['--tool', 'nope'], env: {} }), (error) => error instanceof UsageError && error.exitCode === 2);
});
