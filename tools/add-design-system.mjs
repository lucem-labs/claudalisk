#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentsJson, pluginVersion, releaseRegistryUrl, shadcnVersion, spawnArguments } from './registry.mjs';

const SKILL_SOURCE = 'skills/shadcn/';
const SKIPPED_SKILL_FOLDERS = ['evals/', 'agents/'];

export function parseArgs(argv) {
  const options = { app: undefined, registry: undefined, skill: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--app') options.app = argv[++i];
    else if (arg === '--registry') options.registry = argv[++i];
    else if (arg === '--no-skill') options.skill = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.app) throw new Error('Usage: node tools/add-design-system.mjs --app <frontend folder> [--registry <url with {name}>] [--no-skill]');
  if (options.registry !== undefined && !options.registry.includes('{name}')) throw new Error('--registry must contain {name}');
  return options;
}

export function runCommand(command, args, cwd) {
  const result = spawnSync(...spawnArguments(command, args, cwd));
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
}

export function pinSkillText(text, version) {
  return text.replaceAll('shadcn@latest', `shadcn@${version}`);
}

export function skillFiles(tree) {
  return tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(SKILL_SOURCE))
    .map((entry) => entry.path.slice(SKILL_SOURCE.length))
    .filter((path) => !SKIPPED_SKILL_FOLDERS.some((folder) => path.startsWith(folder)));
}

async function githubJson(fetchImpl, url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'claudalisk' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  return response.json();
}

export async function installSkill({ app, version, fetchImpl = fetch }) {
  const tag = encodeURIComponent(`shadcn@${version}`);
  const commit = await githubJson(fetchImpl, `https://api.github.com/repos/shadcn-ui/ui/commits/${tag}`);
  const { tree } = await githubJson(fetchImpl, `https://api.github.com/repos/shadcn-ui/ui/git/trees/${commit.sha}?recursive=1`);
  const files = skillFiles(tree);
  if (!files.includes('SKILL.md')) throw new Error(`shadcn@${version} has no ${SKILL_SOURCE}SKILL.md`);
  const target = join(app, '.claude', 'skills', 'shadcn');
  for (const file of files) {
    const url = `https://raw.githubusercontent.com/shadcn-ui/ui/${commit.sha}/${SKILL_SOURCE}${file}`;
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
    const path = join(target, file);
    mkdirSync(dirname(path), { recursive: true });
    if (/\.(md|mjs|js|ts|tsx|css|ya?ml|json)$/.test(file)) writeFileSync(path, pinSkillText(await response.text(), version));
    else writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  return files.length;
}

export async function addDesignSystem({ app, registry, skill }, { run = runCommand, fetchImpl = fetch, log = console.log } = {}) {
  const appRoot = resolve(app);
  if (!existsSync(join(appRoot, 'package.json'))) throw new Error(`${appRoot} has no package.json`);
  const configPath = join(appRoot, 'components.json');
  if (existsSync(configPath)) throw new Error(`${configPath} already exists; run shadcn add @claudalisk/base in it instead`);
  const version = shadcnVersion();
  const registryUrl = registry ?? releaseRegistryUrl(pluginVersion());
  writeFileSync(configPath, `${JSON.stringify(componentsJson(registryUrl), null, 2)}\n`);
  log(`Wrote components.json with @claudalisk at ${registryUrl}`);
  await run('npx', ['--yes', `shadcn@${version}`, 'add', '@claudalisk/base', '--yes'], appRoot);
  if (skill) {
    const count = await installSkill({ app: appRoot, version, fetchImpl });
    log(`Added the shadcn skill (${count} files) for shadcn@${version} in .claude/skills/shadcn`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await addDesignSystem(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}
