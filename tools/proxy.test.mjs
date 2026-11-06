import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeFile, main } from './proxy.mjs';
import { readRegistry, registerApp } from './app-registry.mjs';

const home = () => mkdtempSync(join(tmpdir(), 'proxy-home-'));

const row = (Names, Ports, Labels = '', Image = 'img') => JSON.stringify({ Names, Ports, Labels, Image });
const OURS = 'com.docker.compose.project=traefik,other=1';

function fake({ ps = [], networks = [] } = {}) {
  const calls = [];
  const docker = (args, options) => {
    calls.push({ args, env: options?.env });
    if (args[0] === 'ps') return ps.join('\n');
    if (args[0] === 'network' && args[1] === 'ls') return networks.join('\n');
    return '';
  };
  return { docker, calls };
}

const changes = (calls) => calls.filter((c) => c.args[0] === 'compose' || (c.args[0] === 'network' && c.args[1] === 'create'));

function run(argv, options = {}) {
  const h = options.home ?? home();
  const out = [];
  const f = fake(options);
  main(argv, { docker: f.docker, home: h, write: (m) => out.push(m) });
  return { ...f, out, home: h };
}

test('up on a clean machine creates the network, starts the proxy and registers it with the port', () => {
  const r = run(['up']);
  assert.deepEqual(changes(r.calls).map((c) => c.args), [
    ['network', 'create', 'traefik'],
    ['compose', '-f', composeFile, '-p', 'traefik', 'up', '-d', '--wait'],
  ]);
  assert.equal(changes(r.calls)[1].env.PROXY_PORT, '80');
  assert.deepEqual(readRegistry({ home: r.home }).proxy, { composeProject: 'traefik', network: 'traefik', port: 80 });
});

test('up --port uses and records that port', () => {
  const r = run(['up', '--port', '8080']);
  assert.equal(changes(r.calls)[1].env.PROXY_PORT, '8080');
  assert.equal(readRegistry({ home: r.home }).proxy.port, 8080);
});

test('up with the network already there does not create it', () => {
  const r = run(['up'], { networks: ['traefik'] });
  assert.deepEqual(changes(r.calls).map((c) => c.args[0]), ['compose']);
});

test('a network whose name only contains traefik does not count', () => {
  const r = run(['up'], { networks: ['traefik-old'] });
  assert.deepEqual(changes(r.calls).map((c) => c.args[0]), ['network', 'compose']);
});

test('up with the proxy already running makes no compose call and registers the published port', () => {
  const r = run(['up'], { networks: ['traefik'], ps: [row('traefik-traefik-1', '127.0.0.1:8081->80/tcp', OURS)] });
  assert.deepEqual(changes(r.calls), []);
  assert.match(r.out.join('\n'), /already running/);
  assert.equal(readRegistry({ home: r.home }).proxy.port, 8081);
});

test('up --port on a running proxy records the port it really publishes and says so', () => {
  const r = run(['up', '--port', '9000'], { networks: ['traefik'], ps: [row('traefik-traefik-1', '127.0.0.1:8081->80/tcp', OURS)] });
  assert.deepEqual(changes(r.calls), []);
  assert.equal(readRegistry({ home: r.home }).proxy.port, 8081);
  assert.match(r.out.join('\n'), /stays on port 8081/);
});

test('recreate keeps the published port even when the registry says otherwise', () => {
  const h = home();
  run(['up', '--port', '9000'], { home: h });
  const r = run(['recreate'], { home: h, networks: ['traefik'], ps: [row('traefik-traefik-1', '127.0.0.1:8081->80/tcp', OURS)] });
  assert.equal(changes(r.calls)[0].env.PROXY_PORT, '8081');
  assert.equal(readRegistry({ home: h }).proxy.port, 8081);
});

test('up stops and changes nothing when another container holds the port', () => {
  const h = home();
  const f = fake({ ps: [row('old-stack-proxy-1', '0.0.0.0:80->80/tcp, [::]:80->80/tcp')], networks: [] });
  assert.throws(() => main(['up'], { docker: f.docker, home: h, write() {} }), /old-stack-proxy-1/);
  assert.deepEqual(changes(f.calls), []);
  assert.deepEqual(readRegistry({ home: h }), { apps: [] });
});

test('a port range that covers the port counts as held', () => {
  const f = fake({ ps: [row('wide', '0.0.0.0:70-90->70-90/tcp')] });
  assert.throws(() => main(['up'], { docker: f.docker, home: home(), write() {} }), /wide/);
});

test('a container publishing another port does not block up', () => {
  const r = run(['up'], { ps: [row('db', '0.0.0.0:5433->5432/tcp')] });
  assert.equal(changes(r.calls).length, 2);
});

test('recreate rebuilds a running proxy with --force-recreate on the registered port', () => {
  const h = home();
  run(['up', '--port', '8080'], { home: h });
  const r = run(['recreate'], { home: h, networks: ['traefik'], ps: [row('traefik-traefik-1', '127.0.0.1:8080->80/tcp', OURS)] });
  assert.deepEqual(changes(r.calls).map((c) => c.args), [['compose', '-f', composeFile, '-p', 'traefik', 'up', '-d', '--wait', '--force-recreate']]);
  assert.equal(changes(r.calls)[0].env.PROXY_PORT, '8080');
});

test('recreate refuses when the proxy is not running', () => {
  const f = fake();
  assert.throws(() => main(['recreate'], { docker: f.docker, home: home(), write() {} }), /not running/);
  assert.deepEqual(changes(f.calls), []);
});

test('recreate refuses when another container holds the port', () => {
  const f = fake({ ps: [row('traefik-traefik-1', '127.0.0.1:80->80/tcp', OURS), row('intruder', '0.0.0.0:80->80/tcp')] });
  assert.throws(() => main(['recreate'], { docker: f.docker, home: home(), write() {} }), /intruder/);
  assert.deepEqual(changes(f.calls), []);
});

test('status is read-only and lists the proxy, the network and the app URLs', () => {
  const h = home();
  registerApp({ name: 'shop', hostPrefix: 'shop', repo: 'acme/shop', databases: [{ role: 'app', envVar: 'DB' }], ports: { devDb: 5433, apiLocal: 5100 }, uat: { composeProject: 'shop-uat', volume: 'v' } }, { home: h });
  const r = run(['status'], { home: h, networks: ['traefik'], ps: [row('traefik-traefik-1', '127.0.0.1:80->80/tcp', OURS, 'traefik:v3.6.1')] });
  assert.deepEqual(changes(r.calls), []);
  const text = r.out.join('\n');
  assert.match(text, /traefik-traefik-1 running, image traefik:v3\.6\.1/);
  assert.match(text, /network traefik: exists/);
  assert.match(text, /http:\/\/shop\.dev\.localhost, http:\/\/shop\.uat\.localhost/);
});

test('status says when the proxy is down', () => {
  const r = run(['status']);
  assert.match(r.out.join('\n'), /not running/);
  assert.match(r.out.join('\n'), /network traefik: missing/);
});

test('bad commands and ports are refused', () => {
  const f = fake();
  for (const argv of [[], ['down'], ['status', 'x'], ['up', '--port'], ['up', '--port', 'abc'], ['up', '--port', '70000'], ['up', '--bogus']]) {
    assert.throws(() => main(argv, { docker: f.docker, home: home(), write() {} }), /usage|--port/);
  }
  assert.deepEqual(changes(f.calls), []);
});

test('the compose file pins Traefik by tag and digest and keeps the fixed names', () => {
  const text = readFileSync(composeFile, 'utf8');
  assert.match(text, /^name: traefik$/m);
  assert.match(text, /image: traefik:v3\.\d+\.\d+@sha256:[0-9a-f]{64}$/m);
  assert.match(text, /127\.0\.0\.1:\$\{PROXY_PORT:-80\}:80/);
  assert.match(text, /docker\.sock:ro/);
  assert.match(text, /exposedbydefault=false/);
  assert.match(text, /Host\(`traefik\.localhost`\)/);
  assert.doesNotMatch(text, /\r/);
  assert.doesNotMatch(text, /^\s*#/m);
});
