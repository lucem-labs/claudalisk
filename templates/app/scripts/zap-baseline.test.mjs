import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROXY_HOST, REPORT_MARKER, UsageError, ZAP_IMAGE, baseline, devTarget, dockerArgs, parseArgs, splitReport, verdict } from './zap-baseline.mjs';

const target = 'http://shop.dev.localhost';

function fakes({ address = '192.168.65.254', code = 0, stdout = `crawled\n${REPORT_MARKER}\n# Report\n`, stderr = '' } = {}) {
  const seen = { hosts: [], docker: [], summary: [], log: [], error: [] };
  return {
    seen,
    io: {
      resolveHost: async (host) => { seen.hosts.push(host); return address; },
      rules: '10109\tINFO\t(Modern Web Application)\n',
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
    'http://dev.localhost', 'http://a.b.dev.localhost', 'http://shop.dev.localhost.example.com', 'not a url',
  ]) {
    assert.throws(() => devTarget(other), UsageError, other);
  }
});

test('parseArgs needs a target and defaults the proxy host and image', () => {
  assert.throws(() => parseArgs([]), UsageError);
  assert.deepEqual(parseArgs(['--target', target]), { target, proxyHost: DEFAULT_PROXY_HOST, image: ZAP_IMAGE });
  assert.equal(parseArgs(['--target', target, '--proxy-host', '192.168.65.254']).proxyHost, '192.168.65.254');
  assert.throws(() => parseArgs(['--target', target, '--proxy-host']), UsageError);
  assert.throws(() => parseArgs(['--target', 'http://shop.uat.localhost']), UsageError);
});

test('the image is pinned by digest', () => {
  assert.match(ZAP_IMAGE, /:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
});

test('dockerArgs mounts nothing, writes reports to tmpfs and maps dev to the proxy address', () => {
  const args = dockerArgs({ target, address: '10.0.0.5', image: 'zap@sha256:abc' });
  assert.ok(!args.includes('-v') && !args.includes('--volume') && !args.includes('--mount'));
  assert.deepEqual(args.slice(0, 9), ['run', '--rm', '-i', '--tmpfs', '/zap/wrk:rw,uid=1000,gid=1000', '--add-host', 'shop.dev.localhost:10.0.0.5', '--entrypoint', 'sh']);
  assert.equal(args[9], 'zap@sha256:abc');
  assert.match(args[11], /^cat > \/zap\/wrk\/rules\.tsv; zap-baseline\.py -t 'http:\/\/shop\.dev\.localhost' -c rules\.tsv /);
});

test('splitReport separates the log from the report', () => {
  assert.deepEqual(splitReport(`log\n${REPORT_MARKER}\nreport`), { log: 'log\n', report: 'report' });
  assert.deepEqual(splitReport('log only'), { log: 'log only', report: undefined });
});

test('verdict maps the baseline exit codes', () => {
  assert.match(verdict(0, target), /passed/);
  assert.throws(() => verdict(1, target), /failures/);
  assert.throws(() => verdict(2, target), /warnings.*security-suppression/);
  assert.throws(() => verdict(3, target), /could not run/);
});

test('baseline pipes the rules in, prints the log and puts the report in the summary', async () => {
  const { seen, io } = fakes();
  const message = await baseline({ target, proxyHost: DEFAULT_PROXY_HOST, image: ZAP_IMAGE }, io);
  assert.match(message, /passed/);
  assert.deepEqual(seen.hosts, [DEFAULT_PROXY_HOST]);
  assert.equal(seen.docker.length, 1);
  assert.equal(seen.docker[0].input, io.rules);
  assert.ok(seen.docker[0].args.includes('shop.dev.localhost:192.168.65.254'));
  assert.deepEqual(seen.log, ['crawled\n']);
  assert.deepEqual(seen.summary, ['# Report\n']);
});

test('baseline refuses before docker when the proxy host does not resolve', async () => {
  const { seen, io } = fakes({ address: null });
  await assert.rejects(baseline({ target, proxyHost: 'nowhere', image: ZAP_IMAGE }, io), /Cannot resolve nowhere.*--proxy-host/);
  assert.equal(seen.docker.length, 0);
});

test('baseline fails on warnings after writing the report', async () => {
  const { seen, io } = fakes({ code: 2 });
  await assert.rejects(baseline({ target, proxyHost: DEFAULT_PROXY_HOST, image: ZAP_IMAGE }, io), /warnings/);
  assert.equal(seen.summary.length, 1);
});
