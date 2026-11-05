#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAppConfig } from './app-config.mjs';

export const registryPath = ({ home = homedir() } = {}) => join(home, '.claudalisk', 'apps.json');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value !== '';
const isPort = (value) => Number.isInteger(value) && value > 0 && value <= 65535;

function problemsOf(registry) {
  if (!isObject(registry)) return ['the registry must be an object'];
  const problems = [];
  if (!Array.isArray(registry.apps)) return ['"apps" must be an array'];
  registry.apps.forEach((app, i) => {
    const where = `apps[${i}]`;
    if (!isObject(app)) return problems.push(`${where} must be an object`);
    for (const key of ['name', 'repo', 'hostPrefix']) if (!isText(app[key])) problems.push(`${where}.${key} must be a string`);
    if (!isObject(app.uat) || !isText(app.uat.composeProject) || !isText(app.uat.volume)) problems.push(`${where}.uat needs composeProject and volume`);
    else if (app.uat.protectedVolumes !== undefined && !(Array.isArray(app.uat.protectedVolumes) && app.uat.protectedVolumes.every(isText))) problems.push(`${where}.uat.protectedVolumes must be an array of strings`);
    if (!isObject(app.ports) || !isPort(app.ports.devDb) || !isPort(app.ports.apiLocal)) problems.push(`${where}.ports needs devDb and apiLocal`);
  });
  if (registry.proxy !== undefined && (!isObject(registry.proxy) || !isText(registry.proxy.composeProject) || !isText(registry.proxy.network))) problems.push('"proxy" needs composeProject and network');
  if (registry.runners !== undefined && (!isObject(registry.runners) || !isText(registry.runners.composeProject))) problems.push('"runners" needs composeProject');
  return problems;
}

export function readRegistry({ home = homedir() } = {}) {
  const path = registryPath({ home });
  if (!existsSync(path)) return { apps: [] };
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
  const problems = problemsOf(registry);
  if (problems.length) throw new Error(`${path} has the wrong shape: ${problems.join('; ')}`);
  return registry;
}

function writeRegistry(registry, { home }) {
  const path = registryPath({ home });
  const problems = problemsOf(registry);
  if (problems.length) throw new Error(`refusing to write ${path}: ${problems.join('; ')}`);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`);
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

function clashes(app, other) {
  const found = [];
  if (app.repo === other.repo) found.push(`repo ${app.repo}`);
  if (app.hostPrefix === other.hostPrefix) found.push(`hostPrefix ${app.hostPrefix}`);
  if (app.uat.composeProject === other.uat.composeProject) found.push(`uat.composeProject ${app.uat.composeProject}`);
  const volumesOf = ({ uat }) => [uat.volume, ...(uat.protectedVolumes ?? [])];
  for (const volume of volumesOf(app)) if (volumesOf(other).includes(volume)) found.push(`volume ${volume}`);
  const used = [other.ports.devDb, other.ports.apiLocal];
  for (const [role, port] of Object.entries(app.ports)) if (used.includes(port)) found.push(`port ${port} (${role})`);
  return found;
}

export function registerApp(config, { home = homedir() } = {}) {
  const registry = readRegistry({ home });
  const entry = {
    name: config.name,
    repo: config.repo,
    hostPrefix: config.hostPrefix,
    uat: { composeProject: config.uat.composeProject, volume: config.uat.volume, protectedVolumes: config.uat.protectedVolumes ?? [] },
    ports: { devDb: config.ports.devDb, apiLocal: config.ports.apiLocal },
  };
  for (const other of registry.apps) {
    if (other.name === entry.name) continue;
    const found = clashes(entry, other);
    if (found.length) throw new Error(`${entry.name} clashes with ${other.name}: ${found.join(', ')}`);
  }
  const apps = [...registry.apps.filter((a) => a.name !== entry.name), entry].sort((a, b) => a.name.localeCompare(b.name));
  writeRegistry({ ...registry, apps }, { home });
  return entry;
}

export function registerProxy({ composeProject, network }, { home = homedir() } = {}) {
  writeRegistry({ ...readRegistry({ home }), proxy: { composeProject, network } }, { home });
}

export function registerRunners({ composeProject }, { home = homedir() } = {}) {
  writeRegistry({ ...readRegistry({ home }), runners: { composeProject } }, { home });
}

export function allocatePorts(registry, { devDbBase = 5433, apiLocalBase = 5100 } = {}) {
  const used = new Set(registry.apps.flatMap((a) => [a.ports.devDb, a.ports.apiLocal]));
  const lowest = (base) => {
    let port = base;
    while (used.has(port)) port += 1;
    return port;
  };
  const devDb = lowest(devDbBase);
  used.add(devDb);
  return { devDb, apiLocal: lowest(apiLocalBase) };
}

export function main(argv, { home = homedir(), write = console.log } = {}) {
  const [command, appRoot] = argv;
  if (command !== 'register' || !appRoot) throw new Error('usage: node tools/app-registry.mjs register <appRoot>');
  const root = resolve(appRoot);
  const config = readAppConfig(root);
  if (!config) throw new Error(`${join(root, '.claude', 'claudalisk.json')} is missing`);
  const entry = registerApp(config, { home });
  write(`registered ${entry.name} (${entry.repo}) in ${registryPath({ home })}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
