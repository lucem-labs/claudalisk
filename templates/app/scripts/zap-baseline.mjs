#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:2.17.0@sha256:030d3df57735dacbb83464854758e674dd9ad01d79d12a129a8e58b1fd384238';
export const DEFAULT_PROXY_HOST = 'host.docker.internal';
export const REPORT_MARKER = '===ZAP-REPORT===';

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { target: undefined, proxyHost: DEFAULT_PROXY_HOST, image: ZAP_IMAGE };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') options.target = argv[++i];
    else if (arg === '--proxy-host') options.proxyHost = argv[++i];
    else if (arg === '--image') options.image = argv[++i];
    else throw new UsageError(`Unknown argument '${arg}'.`);
  }
  if (!options.target) throw new UsageError('Name dev with --target http://<app>.dev.localhost.');
  if (!options.proxyHost) throw new UsageError('--proxy-host needs a host name or address.');
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

export function zapScript(target) {
  return `cat > /zap/wrk/rules.tsv; zap-baseline.py -t '${target}' -c rules.tsv -w report.md -s; status=$?; echo '${REPORT_MARKER}'; cat /zap/wrk/report.md; exit $status`;
}

export function dockerArgs({ target, address, image }) {
  return [
    'run', '--rm', '-i',
    '--tmpfs', '/zap/wrk:rw,uid=1000,gid=1000',
    '--add-host', `${new URL(target).hostname}:${address}`,
    '--entrypoint', 'sh', image, '-c', zapScript(target),
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

export async function baseline(options, { resolveHost, rules, docker, summary, log, error }) {
  const address = await resolveHost(options.proxyHost);
  if (!address) throw new Error(`Cannot resolve ${options.proxyHost}. Run the baseline where dev and its proxy run, or pass --proxy-host with the address containers use for the host.`);
  const result = docker(dockerArgs({ target: options.target, address, image: options.image }), rules);
  const { log: output, report } = splitReport(result.stdout ?? '');
  log(output);
  if (result.stderr) error(result.stderr);
  if (report !== undefined) summary(report);
  return verdict(result.code, options.target);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  Promise.resolve()
    .then(() => baseline(parseArgs(process.argv.slice(2)), {
      resolveHost: (host) => lookup(host, { family: 4 }).then((found) => found.address, () => null),
      rules: readFileSync(join(root, '.zap', 'rules.tsv'), 'utf8'),
      docker: (args, input) => {
        const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        if (result.error) throw new Error(`docker could not start: ${result.error.message}`);
        return { code: result.status, stdout: result.stdout, stderr: result.stderr };
      },
      summary: (report) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report); },
      log: console.log,
      error: console.error,
    }))
    .then((message) => console.log(message))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    });
}
