#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cpSync, createReadStream, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDesignSystem } from './add-design-system.mjs';
import { builtRegistry, checkRegistrySources, listFiles, registryRoot, shadcnVersion, spawnArguments } from './registry.mjs';

export function runAsync(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const [file, list, options] = spawnArguments(command, args, cwd);
    const child = spawn(file, list, options);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

export function compareBuilds(expectedDir, actualDir) {
  const names = (dir) => listFiles(dir, ['.json']).map((file) => file.slice(dir.length + 1).replaceAll('\\', '/'));
  const expected = names(expectedDir);
  const actual = names(actualDir);
  const errors = [];
  for (const name of actual) {
    if (!expected.includes(name)) errors.push(`registry/public/r/${name} is missing; run shadcn build`);
    else if (readFileSync(join(expectedDir, name), 'utf8') !== readFileSync(join(actualDir, name), 'utf8')) {
      errors.push(`registry/public/r/${name} is stale; run shadcn build`);
    }
  }
  for (const name of expected) if (!actual.includes(name)) errors.push(`registry/public/r/${name} is not built from registry.json; delete it`);
  return errors;
}

function serve(dir) {
  const root = resolve(dir);
  const server = createServer((request, response) => {
    const path = normalize(join(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname)));
    if (!path.startsWith(root + sep) || !existsSync(path)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    createReadStream(path).pipe(response);
  });
  return new Promise((resolvePromise) => server.listen(0, '127.0.0.1', () => resolvePromise(server)));
}

export function startMcpServer(version, cwd) {
  const [file, list, options] = spawnArguments('npx', ['--yes', `shadcn@${version}`, 'mcp'], cwd);
  const child = spawn(file, list, { ...options, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let buffer = '';
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('{')) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`MCP ${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result);
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const request = (method, params) =>
    new Promise((resolvePromise, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolvePromise, reject, method });
      send({ id, method, params });
    });
  return {
    async initialize() {
      await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claudalisk', version: '0' } });
      send({ method: 'notifications/initialized' });
    },
    async callTool(name, args) {
      const result = await request('tools/call', { name, arguments: args });
      const text = (result.content ?? []).map((part) => part.text ?? '').join('\n');
      if (result.isError) throw new Error(`MCP ${name}: ${text}`);
      return text;
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

async function checkMcp(version, app) {
  const mcp = startMcpServer(version, app);
  try {
    await mcp.initialize();
    const registries = await mcp.callTool('get_project_registries', {});
    if (!registries.includes('@claudalisk')) throw new Error(`The MCP server does not see @claudalisk: ${registries}`);
    const claudalisk = await mcp.callTool('list_items_in_registries', { registries: ['@claudalisk'] });
    if (!claudalisk.includes('action-button')) throw new Error(`The MCP server does not list @claudalisk items: ${claudalisk}`);
    const shadcn = await mcp.callTool('search_items_in_registries', { registries: ['@shadcn'], query: 'dialog' });
    if (!shadcn.includes('dialog')) throw new Error(`The MCP server does not search @shadcn: ${shadcn}`);
  } finally {
    mcp.close();
  }
}

async function main() {
  const sourceErrors = checkRegistrySources();
  if (sourceErrors.length) throw new Error(sourceErrors.join('\n'));
  console.log('✓ Registry sources have no comments and no raw colours.');

  const version = shadcnVersion();
  const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'claudalisk-registry-')));
  try {
    const build = join(work, 'r');
    await runAsync('npx', ['--yes', `shadcn@${version}`, 'build', 'registry.json', '--output', build], registryRoot);
    const buildErrors = compareBuilds(builtRegistry, build);
    if (buildErrors.length) throw new Error(buildErrors.join('\n'));
    console.log('✓ registry/public/r matches shadcn build.');

    const app = join(work, 'app');
    cpSync(join(registryRoot, 'fixture-app'), app, {
      recursive: true,
      filter: (path) => !path.includes(`${sep}node_modules`) && !path.includes(`${sep}dist`),
    });
    await runAsync('npm', ['ci', '--no-audit', '--no-fund'], app);
    const server = await serve(build);
    try {
      const registry = `http://127.0.0.1:${server.address().port}/{name}.json`;
      await addDesignSystem({ app, registry, skill: !process.argv.includes('--no-skill') }, { run: runAsync });
      await runAsync('npx', ['--yes', `shadcn@${version}`, 'add', 'input', '--yes'], app);
      await checkMcp(version, app);
      console.log('✓ shadcn\'s MCP server lists @claudalisk items and searches @shadcn.');
    } finally {
      server.close();
    }
    await runAsync('npm', ['run', 'build'], app);
    await runAsync('npm', ['test'], app);
    console.log('✓ @claudalisk/base installs into a fresh Vite app, which type-checks, builds and passes its tests.');
  } finally {
    if (!process.argv.includes('--keep')) rmSync(work, { recursive: true, force: true });
    else console.log(`Kept ${work}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
