import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PROXY_HOST, REPORT_MARKER, UsageError, ZAP_IMAGE, ZAP_SCRIPT,
  baseline, devTarget, dockerArgs, isPrivateAddress, main, parseArgs, rulesReader, splitReport, verdict,
} from './zap-baseline.mjs';

const target = 'http://shop.dev.localhost';
const options = { target, proxyHost: DEFAULT_PROXY_HOST };

function fakes({ address = '192.168.65.254', code = 0, stdout = `crawled\n${REPORT_MARKER}\n# Report\n`, stderr = '' } = {}) {
  const seen = { reads: 0, hosts: [], docker: [], summary: [], log: [], error: [] };
  return {
    seen,
    io: {
      readRules: () => { seen.reads++; return '10109\tINFO\t(Modern Web Application)\n'; },
      resolveHost: async (host) => { seen.hosts.push(host); return address; },
      docker: (args, input) => { seen.docker.push({ args, input }); return { code, stdout, stderr }; },
      summary: (report) => seen.summary.push(report),
      log: (text) => seen.log.push(text),
      error: (text) => seen.error.push(text),
    },
  };
}

test('devTarget accepts only a dev origin', () => {
  assert.equal(devTarget('http://shop.dev.localhost/'), target);
  for (const other of [
    'http://shop.uat.localhost', 'https://shop.dev.localhost', 'http://shop.dev.localhost:8080', 'http://shop.dev.localhost/api',
    'http://shop.dev.localhost/?x=1', 'http://shop.dev.localhost/#a', 'http://dev.localhost', 'http://a.b.dev.localhost',
    'http://shop.dev.localhost.example.com', 'http://shop.dev.localhost./', 'not a url',
  ]) {
    assert.throws(() => devTarget(other), UsageError, other);
  }
});

test('parseArgs needs a target, defaults the proxy host and takes only an IPv4 address instead', () => {
  assert.throws(() => parseArgs([]), /\nUsage: node scripts\/zap-baseline\.mjs/);
  assert.deepEqual(parseArgs(['--target', target]), options);
  assert.equal(parseArgs(['--target', target, '--proxy-host', '192.168.65.254']).proxyHost, '192.168.65.254');
  for (const argv of [['--proxy-host'], ['--proxy-host', 'uat.example.com'], ['--image', 'evil']]) {
    assert.throws(() => parseArgs(['--target', target, ...argv]), UsageError, argv.join(' '));
  }
  assert.throws(() => parseArgs(['--target', 'http://shop.uat.localhost']), UsageError);
});

test('isPrivateAddress accepts loopback and private ranges only', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.65.254']) assert.equal(isPrivateAddress(address), true, address);
  for (const address of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', 'localhost', '::1']) assert.equal(isPrivateAddress(address), false, address);
});

test('the image is pinned by digest', () => {
  assert.match(ZAP_IMAGE, /:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
});

test('the script keeps the baseline exit status and prints the report after the marker', () => {
  assert.equal(
    ZAP_SCRIPT,
    `cat > /zap/wrk/rules.tsv; zap-baseline.py -t "$ZAP_TARGET" -c rules.tsv -w report.md -s; status=$?; echo '${REPORT_MARKER}'; cat /zap/wrk/report.md; exit $status`,
  );
});

test('dockerArgs mounts nothing, passes the target in the environment and maps dev to the proxy address', () => {
  assert.deepEqual(dockerArgs({ target, address: '10.0.0.5' }), [
    'run', '--rm', '-i',
    '--tmpfs', '/zap/wrk:rw,uid=1000,gid=1000',
    '--add-host', 'shop.dev.localhost:10.0.0.5',
    '--env', `ZAP_TARGET=${target}`,
    '--entrypoint', 'sh', ZAP_IMAGE, '-c', ZAP_SCRIPT,
  ]);
});

test('splitReport separates the log from the report', () => {
  assert.deepEqual(splitReport(`log\n${REPORT_MARKER}\nreport`), { log: 'log\n', report: 'report' });
  assert.deepEqual(splitReport(`log\r\n${REPORT_MARKER}\r\nreport`), { log: 'log\r\n', report: 'report' });
  assert.deepEqual(splitReport('log only'), { log: 'log only', report: undefined });
});

test('verdict maps the baseline exit codes', () => {
  assert.match(verdict(0, target), /passed/);
  assert.throws(() => verdict(1, target), /failures/);
  assert.throws(() => verdict(2, target), /warnings.*security-suppression/);
  assert.throws(() => verdict(3, target), /could not run/);
});

test('baseline pipes the rules in and prints the report to the log and the summary', async () => {
  const { seen, io } = fakes();
  assert.match(await baseline(options, io), /passed/);
  assert.deepEqual(seen.hosts, [DEFAULT_PROXY_HOST]);
  assert.equal(seen.docker.length, 1);
  assert.equal(seen.docker[0].input, '10109\tINFO\t(Modern Web Application)\n');
  assert.ok(seen.docker[0].args.includes('shop.dev.localhost:192.168.65.254'));
  assert.deepEqual(seen.log, ['crawled\n', '# Report\n']);
  assert.deepEqual(seen.summary, ['# Report\n']);
});

test('baseline refuses before docker when the proxy host does not resolve or is public', async () => {
  for (const [address, message] of [[null, /Cannot resolve.*--proxy-host/], ['8.8.8.8', /not a loopback or private address/]]) {
    const { seen, io } = fakes({ address });
    await assert.rejects(baseline(options, io), message);
    assert.equal(seen.docker.length, 0);
  }
});

test('baseline fails on warnings after writing the report', async () => {
  const { seen, io } = fakes({ code: 2 });
  await assert.rejects(baseline(options, io), /warnings/);
  assert.equal(seen.summary.length, 1);
});

test('baseline writes no summary when ZAP crashed before the report, and passes stderr on', async () => {
  const { seen, io } = fakes({ code: 3, stdout: 'boom', stderr: 'err' });
  await assert.rejects(baseline(options, io), /could not run/);
  assert.deepEqual(seen.summary, []);
  assert.deepEqual(seen.log, ['boom']);
  assert.deepEqual(seen.error, ['err']);
});

test('main refuses a uat target before it reads the rules or runs docker', async () => {
  const { seen, io } = fakes();
  await assert.rejects(main(['--target', 'http://shop.uat.localhost'], io), UsageError);
  assert.equal(seen.reads, 0);
  assert.equal(seen.docker.length, 0);
});

test('rulesReader refuses a missing rules file with its path, and reads one that exists', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'zap-baseline-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => rulesReader(root)(), /rules\.tsv is missing/);
  mkdirSync(join(root, '.zap'));
  writeFileSync(join(root, '.zap', 'rules.tsv'), 'rules');
  assert.equal(rulesReader(root)(), 'rules');
});

test('baseline refuses a missing rules file before docker', async () => {
  const { seen, io } = fakes();
  await assert.rejects(baseline(options, { ...io, readRules: () => { throw new Error('rules.tsv is missing'); } }), /missing/);
  assert.equal(seen.docker.length, 0);
});
