#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegistry, registerProxy } from './app-registry.mjs';

export const PROJECT = 'traefik';
export const NETWORK = 'traefik';
export const DEFAULT_PORT = 80;
export const composeFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'proxy', 'compose.yml');

const USAGE = 'usage: node tools/proxy.mjs status | up [--port N] | recreate [--port N]';

export function dockerRunner(args, { env = {} } = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}

const lines = (text) => String(text).split(/\r?\n/).filter((line) => line.trim() !== '');

function containers(docker) {
  return lines(docker(['ps', '--format', '{{json .}}'])).map((line) => {
    const row = JSON.parse(line);
    const labels = String(row.Labels ?? '');
    return { name: row.Names, image: row.Image, ports: String(row.Ports ?? ''), networks: String(row.Networks ?? '').split(','), inProject: labels.split(',').includes(`com.docker.compose.project=${PROJECT}`) };
  });
}

function publishes(ports, port) {
  for (const m of ports.matchAll(/(?:^|[\s,:])(\d+)(?:-(\d+))?->/g)) {
    const low = Number(m[1]);
    const high = m[2] ? Number(m[2]) : low;
    if (port >= low && port <= high) return true;
  }
  return false;
}

const publishedPort = (ports) => {
  const m = /:(\d+)->80\/tcp/.exec(ports);
  return m ? Number(m[1]) : null;
};

function networkExists(docker) {
  return lines(docker(['network', 'ls', '--filter', `name=^${NETWORK}$`, '--format', '{{.Name}}'])).includes(NETWORK);
}

function parseFlags(args) {
  let port;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--port') throw new Error(USAGE);
    const value = args[i + 1];
    if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) throw new Error('--port needs a number from 1 to 65535');
    port = Number(value);
    i += 1;
  }
  return { port };
}

export function proxyProblem({ docker = dockerRunner } = {}) {
  let running;
  try {
    running = containers(docker).filter((c) => c.inProject);
  } catch {
    return 'Docker did not answer, so the shared proxy was not checked.';
  }
  if (running.length === 0) return 'No shared proxy is running, so the app will not be reachable and its deploy will refuse. Use the proxy skill.';
  if (!running.some((c) => c.networks.includes(NETWORK))) return `The shared proxy is not on the ${NETWORK} network, so the app will not be reachable. Use the proxy skill.`;
  return null;
}

export function status({ docker = dockerRunner, home = homedir(), write = console.log } = {}) {
  const registry = readRegistry({ home });
  const running = containers(docker).filter((c) => c.inProject);
  if (running.length === 0) write(`proxy: not running (Compose project ${PROJECT})`);
  for (const c of running) write(`proxy: ${c.name} running, image ${c.image}, ports ${c.ports || 'none'}`);
  write(`network ${NETWORK}: ${networkExists(docker) ? 'exists' : 'missing'}`);
  if (registry.proxy) write(`registered: project ${registry.proxy.composeProject}, network ${registry.proxy.network}${registry.proxy.port ? `, port ${registry.proxy.port}` : ''}`);
  else write('registered: no');
  if (registry.apps.length === 0) write('apps: none registered');
  for (const app of registry.apps) write(`app ${app.name}: http://${app.hostPrefix}.dev.localhost, http://${app.hostPrefix}.uat.localhost`);
}

function start({ port, force }, { docker, write }) {
  docker(['compose', '-f', composeFile, '-p', PROJECT, 'up', '-d', '--wait', ...(force ? ['--force-recreate'] : [])], { env: { PROXY_PORT: String(port) } });
  write(force ? `proxy recreated on port ${port}` : `proxy started on port ${port}`);
}

function blocker(docker, port) {
  return containers(docker).find((c) => !c.inProject && publishes(c.ports, port));
}

export function up(flags, { docker = dockerRunner, home = homedir(), write = console.log } = {}) {
  const requested = parseFlags(flags).port;
  const running = containers(docker).filter((c) => c.inProject);
  const published = running.length ? publishedPort(running[0].ports) : null;
  const port = published ?? requested ?? readRegistry({ home }).proxy?.port ?? DEFAULT_PORT;
  const holder = blocker(docker, port);
  if (holder) throw new Error(`port ${port} is published by ${holder.name} (${holder.image}), which is not part of the ${PROJECT} project. Stop that container, or deploy the proxy first and use --port for another one. Nothing was changed`);
  if (published && requested && requested !== published) write(`the proxy stays on port ${published} while it runs, so --port ${requested} is ignored. "recreate --port ${requested}" moves it`);
  if (!networkExists(docker)) {
    docker(['network', 'create', NETWORK]);
    write(`network ${NETWORK} created`);
  } else write(`network ${NETWORK} already exists`);
  if (running.length) write(`the proxy is already running (${running[0].name}); left untouched`);
  else start({ port, force: false }, { docker, write });
  registerProxy({ composeProject: PROJECT, network: NETWORK, port }, { home });
  write(`registered the proxy on port ${port}`);
}

export function recreate(flags, { docker = dockerRunner, home = homedir(), write = console.log } = {}) {
  const requested = parseFlags(flags).port;
  const running = containers(docker).filter((c) => c.inProject);
  if (running.length === 0) throw new Error('the proxy is not running, so there is nothing to recreate. Use "up"');
  const port = requested ?? publishedPort(running[0].ports) ?? readRegistry({ home }).proxy?.port ?? DEFAULT_PORT;
  const holder = blocker(docker, port);
  if (holder) throw new Error(`port ${port} is published by ${holder.name} (${holder.image}), which is not part of the ${PROJECT} project. Nothing was changed`);
  if (!networkExists(docker)) docker(['network', 'create', NETWORK]);
  start({ port, force: true }, { docker, write });
  registerProxy({ composeProject: PROJECT, network: NETWORK, port }, { home });
}

export function main(argv, deps = {}) {
  const [command, ...flags] = argv;
  if (command === 'status' && flags.length === 0) return status(deps);
  if (command === 'up') return up(flags, deps);
  if (command === 'recreate') return recreate(flags, deps);
  throw new Error(USAGE);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
