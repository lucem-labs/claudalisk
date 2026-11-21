import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { proxyProject } from '../environment.mjs';

export const USAGE = 'Usage: node scripts/zap-baseline.mjs --target http://<app>.dev.localhost [--proxy-host <IPv4 address> | --proxy-host host.docker.internal]';
export const ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:2.17.0@sha256:030d3df57735dacbb83464854758e674dd9ad01d79d12a129a8e58b1fd384238';
export const DEFAULT_PROXY_HOST = 'host.docker.internal';
export const DEFAULT_PROXY = { composeProject: proxyProject, network: proxyProject };
export const REPORT_MARKER = '===ZAP-REPORT===';
export const ZAP_SCRIPT = `cat > /zap/wrk/rules.tsv; zap-baseline.py -t "$ZAP_TARGET" -c rules.tsv -w report.md -s; status=$?; echo '${REPORT_MARKER}'; cat /zap/wrk/report.md; exit $status`;

export class UsageError extends Error {
  exitCode = 2;
  constructor(message) {
    super(`${message}\n${USAGE}`);
  }
}

export function parseArgs(argv) {
  const options = { target: undefined, proxyHost: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') options.target = argv[++i];
    else if (arg === '--proxy-host') options.proxyHost = argv[++i] ?? '';
    else throw new UsageError(`Unknown argument '${arg}'.`);
  }
  if (!options.target) throw new UsageError('Name dev with --target http://<app>.dev.localhost.');
  if (options.proxyHost !== undefined && options.proxyHost !== DEFAULT_PROXY_HOST && !isIPv4(options.proxyHost)) {
    throw new UsageError(`--proxy-host takes ${DEFAULT_PROXY_HOST} or the IPv4 address containers use for the host.`);
  }
  return { ...options, target: devTarget(options.target) };
}

export function devTarget(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new UsageError(`'${target}' is not a URL.`);
  }
  if (url.protocol !== 'http:' || !/^[a-z0-9-]+\.dev\.localhost$/.test(url.hostname) || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new UsageError(`Refusing to scan '${target}': the ZAP baseline scans only dev, http://<app>.dev.localhost, never uat.`);
  }
  return url.origin;
}

export function isPrivateAddress(address) {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function dockerArgs({ target, address, network, image = ZAP_IMAGE }) {
  return [
    'run', '--rm', '-i',
    ...(network ? ['--network', network] : []),
    '--tmpfs', '/zap/wrk:rw,uid=1000,gid=1000',
    '--add-host', `${new URL(target).hostname}:${address}`,
    '--env', `ZAP_TARGET=${target}`,
    '--entrypoint', 'sh', image, '-c', ZAP_SCRIPT,
  ];
}

export function splitReport(stdout) {
  const at = stdout.indexOf(REPORT_MARKER);
  if (at < 0) return { log: stdout, report: undefined };
  return { log: stdout.slice(0, at), report: stdout.slice(at + REPORT_MARKER.length).replace(/^\r?\n/, '') };
}

export function verdict(code, target) {
  if (code === 0) return `ZAP baseline passed against ${target}.`;
  if (code === 1) throw new Error(`ZAP baseline found failures against ${target}.`);
  if (code === 2) throw new Error(`ZAP baseline found warnings against ${target}. Fix them, or turn a rule off in .zap/rules.tsv with an open security-suppression issue.`);
  throw new Error(`ZAP baseline could not run against ${target} (exit ${code}).`);
}

export function registryProxy({ home = homedir() } = {}) {
  const path = join(home, '.claudalisk', 'apps.json');
  if (!existsSync(path)) return DEFAULT_PROXY;
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
  const proxy = registry?.proxy;
  if (typeof proxy?.composeProject === 'string' && proxy.composeProject && typeof proxy.network === 'string' && proxy.network) {
    return { composeProject: proxy.composeProject, network: proxy.network };
  }
  return DEFAULT_PROXY;
}

export function proxyContainerAddress({ composeProject, network }, docker) {
  const listed = docker(['ps', '--filter', `label=com.docker.compose.project=${composeProject}`, '--filter', 'status=running', '--format', '{{.ID}}']);
  if (listed.code !== 0) return null;
  for (const id of listed.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    const inspected = docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', id]);
    if (inspected.code !== 0) continue;
    let networks;
    try {
      networks = JSON.parse(inspected.stdout);
    } catch {
      continue;
    }
    const address = networks?.[network]?.IPAddress;
    if (isIPv4(address ?? '')) return { address, network };
  }
  return null;
}

export async function proxyRoute(options, { resolveHost, findProxy }) {
  if (options.proxyHost === undefined) {
    const found = await findProxy();
    if (found) return { name: `the proxy container on ${found.network}`, address: found.address, network: found.network };
  }
  const host = options.proxyHost ?? DEFAULT_PROXY_HOST;
  return { name: host, address: await resolveHost(host) };
}

export async function baseline(options, { resolveHost, findProxy, readRules, docker, summary, log, error }) {
  const rules = readRules();
  const route = await proxyRoute(options, { resolveHost, findProxy });
  if (!route.address) {
    const missing = options.proxyHost === undefined ? `The machine-wide proxy container was not found, and ${route.name} does not resolve.` : `Cannot resolve ${route.name}.`;
    throw new Error(`${missing} Run the baseline where dev and its proxy run, or pass --proxy-host with the address containers use for the proxy.`);
  }
  if (!isPrivateAddress(route.address)) throw new Error(`${route.name} is ${route.address}, not a loopback or private address. The baseline reaches dev only through this machine's proxy.`);
  const result = docker(dockerArgs({ target: options.target, address: route.address, network: route.network }), rules);
  const { log: output, report } = splitReport(result.stdout ?? '');
  log(output);
  if (result.stderr) error(result.stderr);
  if (report !== undefined) {
    log(report);
    summary(report);
  }
  return verdict(result.code, options.target);
}

export function rulesReader(root) {
  return () => {
    const path = join(root, '.zap', 'rules.tsv');
    if (!existsSync(path)) throw new Error(`${path} is missing. Copy .zap/rules.tsv from the claudalisk templates.`);
    return readFileSync(path, 'utf8');
  };
}

export async function main(argv, io) {
  return baseline(parseArgs(argv), io);
}


function runDocker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`docker could not start: ${result.error.message}`);
  return { code: result.status ?? 3, stdout: result.stdout, stderr: result.stderr };
}

export async function zapBaseline({ appRoot, argv, env = process.env, home = homedir() }) {
  const message = await main(argv, {
    resolveHost: (host) => lookup(host, { family: 4 }).then((found) => found.address, () => null),
    findProxy: () => proxyContainerAddress(registryProxy({ home }), runDocker),
    readRules: rulesReader(appRoot),
    docker: runDocker,
    summary: (report) => { if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, report); },
    log: console.log,
    error: console.error,
  });
  console.log(message);
}
