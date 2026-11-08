import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, constants, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export const USAGE = 'Usage: node scripts/install-security-tools.mjs --tool <name>[,<name>]... [--destination <folder>]';

export const SECURITY_TOOLS = {
  gitleaks: {
    url: 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz',
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    binary: 'gitleaks',
  },
  'osv-scanner': {
    url: 'https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_linux_amd64',
    sha256: '160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b',
    binary: 'osv-scanner',
  },
  trivy: {
    url: 'https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_Linux-64bit.tar.gz',
    sha256: 'c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0',
    binary: 'trivy',
  },
  zizmor: {
    url: 'https://github.com/zizmorcore/zizmor/releases/download/v1.31.1/zizmor-x86_64-unknown-linux-gnu.tar.gz',
    sha256: 'd185f726bdaf92df78273217dfdd24ebcd6b0ef48cf3ce776ff5762b6e138c99',
    binary: 'zizmor',
  },
  uv: {
    url: 'https://github.com/astral-sh/uv/releases/download/0.13.6/uv-x86_64-unknown-linux-gnu.tar.gz',
    sha256: 'f29c3e94ffabd7e6f3ba521dba169a9b7ec12100bf3257087f0f24f6123f3645',
    binary: 'uv',
  },
};

export class UsageError extends Error {
  exitCode = 2;
  constructor(message) {
    super(`${message}\n${USAGE}`);
  }
}

export function parseArgs(argv) {
  const options = { tools: [], destination: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tool') {
      const names = String(argv[++i] ?? '').split(',').map((name) => name.trim()).filter(Boolean);
      if (names.length === 0) throw new UsageError('--tool needs a tool name.');
      options.tools.push(...names);
    } else if (arg === '--destination') {
      options.destination = argv[++i];
      if (!options.destination) throw new UsageError('--destination needs a folder.');
    } else throw new UsageError(`Unknown argument '${arg}'.`);
  }
  if (options.tools.length === 0) throw new UsageError('Name at least one tool with --tool.');
  return options;
}

function* filesIn(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) yield* filesIn(path);
    else if (entry.isFile()) yield path;
  }
}

export async function installTool({ name, destination, download, untar, chmod = chmodSync, tools = SECURITY_TOOLS, workRoot = tmpdir() }) {
  const tool = Object.hasOwn(tools, name) ? tools[name] : undefined;
  if (!tool) throw new UsageError(`Unknown security tool '${name}'. Known tools: ${Object.keys(tools).join(', ')}.`);
  const content = await download(tool.url);
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== tool.sha256) throw new Error(`Checksum mismatch for ${name} (${tool.url}): expected ${tool.sha256}, got ${actual}.`);
  const work = mkdtempSync(join(workRoot, 'security-tool-'));
  try {
    let binary = join(work, basename(new URL(tool.url).pathname));
    writeFileSync(binary, content);
    if (binary.endsWith('.tar.gz')) {
      const unpacked = join(work, 'unpacked');
      mkdirSync(unpacked);
      untar(binary, unpacked);
      binary = [...filesIn(unpacked)].find((path) => basename(path) === tool.binary);
      if (!binary) throw new Error(`${tool.binary} is not in ${tool.url}.`);
    }
    mkdirSync(destination, { recursive: true });
    const target = join(destination, tool.binary);
    rmSync(target, { force: true });
    copyFileSync(binary, target, constants.COPYFILE_EXCL);
    chmod(target, 0o755);
    return target;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const RELEASE_ASSET_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/;

async function requestReleaseAsset(url, [, owner, repo, tag, assetName], token, request) {
  const repository = `https://api.github.com/repos/${owner}/${repo}`;
  const lookUpRelease = (credentials) => request(`${repository}/releases/tags/${tag}`, { headers: { ...credentials, accept: 'application/vnd.github+json' } });
  let credentials = { authorization: `Bearer ${token}` };
  let release = await lookUpRelease(credentials);
  if (release.status === 401 || release.status === 403) {
    credentials = {};
    release = await lookUpRelease(credentials);
  }
  if (!release.ok) throw new Error(`Downloading ${url} failed: looking up the release returned HTTP ${release.status}: ${(await release.text()).slice(0, 300)}`);
  const { assets } = await release.json();
  const asset = assets.find(({ name }) => name === assetName);
  if (!asset) throw new Error(`Downloading ${url} failed: the release has no asset named ${assetName}.`);
  return request(`${repository}/releases/assets/${asset.id}`, { headers: { ...credentials, accept: 'application/octet-stream' } });
}

export async function download(url, { token, request = fetch } = {}) {
  const releaseAsset = token ? url.match(RELEASE_ASSET_URL) : null;
  const response = releaseAsset ? await requestReleaseAsset(url, releaseAsset, token, request) : await request(url);
  if (!response.ok) throw new Error(`Downloading ${url} failed (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

function untar(archive, folder) {
  const result = spawnSync('tar', ['-xzf', archive, '-C', folder], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Unpacking ${archive} failed: ${result.stderr || result.error?.message}`);
}

export async function main(argv, { env = process.env, log = console.log, io = { download, untar } } = {}) {
  const options = parseArgs(argv);
  const destination = options.destination ?? mkdtempSync(join(env.RUNNER_TEMP || tmpdir(), 'security-tools-'));
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const downloadWithToken = (url) => io.download(url, { token });
  for (const name of options.tools) {
    log(`Installed ${name} at ${await installTool({ name, destination, ...io, download: downloadWithToken })}`);
  }
  if (env.GITHUB_PATH) appendFileSync(env.GITHUB_PATH, `${destination}\n`);
  return destination;
}


export async function installSecurityTools({ argv, env = process.env }) {
  await main(argv, { env });
}
