#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentsJson, pluginVersion, releaseRegistryUrl, shadcnVersion, spawnArguments } from './registry.mjs';
import { stripAppComments } from './strip-comments.mjs';

const SKILL_SOURCE = 'skills/shadcn/';
const SKIPPED_SKILL_FOLDERS = ['evals/', 'agents/'];

export function parseArgs(argv) {
  const options = { app: undefined, registry: undefined, skill: true, skillOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--app') options.app = argv[++i];
    else if (arg === '--registry') options.registry = argv[++i];
    else if (arg === '--no-skill') options.skill = false;
    else if (arg === '--skill-only') options.skillOnly = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.app) throw new Error('Usage: node tools/add-design-system.mjs --app <frontend folder> [--registry <url with {name}>] [--no-skill | --skill-only]');
  if (options.registry !== undefined && !options.registry.includes('{name}')) throw new Error('--registry must contain {name}');
  if (options.skillOnly && !options.skill) throw new Error('--skill-only and --no-skill cannot be combined');
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

export function githubToken(env = process.env, spawn = spawnSync) {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  const result = spawn('gh', ['auth', 'token'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const token = result.status === 0 ? result.stdout?.trim() : '';
  return token || undefined;
}

async function githubResponse(fetchImpl, url, token, accept) {
  const headers = { 'User-Agent': 'claudalisk' };
  if (accept) headers.Accept = accept;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    const hint = token ? '' : '; set GITHUB_TOKEN or sign in with gh auth login';
    throw new Error(`GET ${url} returned ${response.status}${hint}`);
  }
  return response;
}

const githubJson = async (fetchImpl, url, token) => (await githubResponse(fetchImpl, url, token, 'application/vnd.github+json')).json();

export async function fetchSkill({ version, fetchImpl = fetch, token }) {
  const tag = encodeURIComponent(`shadcn@${version}`);
  const commit = await githubJson(fetchImpl, `https://api.github.com/repos/shadcn-ui/ui/commits/${tag}`, token);
  const { tree } = await githubJson(fetchImpl, `https://api.github.com/repos/shadcn-ui/ui/git/trees/${commit.sha}?recursive=1`, token);
  const files = skillFiles(tree);
  if (!files.includes('SKILL.md')) throw new Error(`shadcn@${version} has no ${SKILL_SOURCE}SKILL.md`);
  const fetched = [];
  for (const file of files) {
    const response = await githubResponse(fetchImpl, `https://raw.githubusercontent.com/shadcn-ui/ui/${commit.sha}/${SKILL_SOURCE}${file}`, token);
    const content = /\.(md|mjs|js|ts|tsx|css|ya?ml|json)$/.test(file)
      ? pinSkillText(await response.text(), version)
      : Buffer.from(await response.arrayBuffer());
    fetched.push({ file, content });
  }
  return fetched;
}

export function writeSkill(app, files) {
  const target = join(app, '.claude', 'skills', 'shadcn');
  for (const { file, content } of files) {
    const path = join(target, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

export async function addDesignSystem(
  { app, registry, skill, skillOnly = false },
  { run = runCommand, fetchImpl = fetch, log = console.log, token = githubToken, strip = stripAppComments } = {},
) {
  const appRoot = resolve(app);
  if (!existsSync(join(appRoot, 'package.json'))) throw new Error(`${appRoot} has no package.json`);
  const configPath = join(appRoot, 'components.json');
  if (skillOnly && !existsSync(configPath)) throw new Error(`${configPath} does not exist; run without --skill-only first`);
  if (!skillOnly && existsSync(configPath)) {
    throw new Error(`${configPath} already exists; run shadcn add @claudalisk/base in it, or add the skill with --skill-only`);
  }
  const version = shadcnVersion();
  const skillContent = skill ? await fetchSkill({ version, fetchImpl, token: token() }) : [];
  if (!skillOnly) {
    const registryUrl = registry ?? releaseRegistryUrl(pluginVersion());
    writeFileSync(configPath, `${JSON.stringify(componentsJson(registryUrl), null, 2)}\n`);
    log(`Wrote components.json with @claudalisk at ${registryUrl}`);
    await run('npx', ['--yes', `shadcn@${version}`, 'add', '@claudalisk/base', '--yes'], appRoot);
    const stripped = strip(appRoot);
    if (stripped.length) log(`Removed comments from ${stripped.join(', ')}`);
  }
  if (skill) {
    writeSkill(appRoot, skillContent);
    log(`Added the shadcn skill (${skillContent.length} files) for shadcn@${version} in .claude/skills/shadcn`);
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
