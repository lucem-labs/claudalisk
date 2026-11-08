#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAppConfig } from './app-config.mjs';
import { readRegistry, registerRunners } from './app-registry.mjs';

export const KIT_URL = 'https://github.com/lucem-labs/github-runner-dind.git';
export const CALLBACK_TIMEOUT_MS = 10 * 60 * 1000;
export const PLUGIN_URL = 'https://github.com/lucem-labs/claudalisk';

const USAGE = [
  'usage: node tools/runners.mjs <command>',
  '  status [--config <dir> | --project <name>]',
  '  adopt <dir>',
  '  init (--org <org> | --repo <owner/repo>) --kit-commit <sha> --image <ref@sha256:...> [--dir <dir>] [--project <p>] [--group-id N] [--prefix P] [--labels ci] [--memory 4g]',
  '  app create [--config <dir>] [--name <name>]',
  '  group [--project <p> | --config <dir>] [--apply]',
  '  enroll <appRoot>',
  '  up [--project <p> | --config <dir>]',
  '  logs [--project <p>]',
].join('\n');

const PROJECT = /^[a-z0-9][a-z0-9_-]*$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*)$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const DIGEST = /@sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SAFE_VALUE = /^[A-Za-z0-9._,-]+$/;
const CODE =/^[A-Za-z0-9_-]+$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

const firstLine = (text) => String(text ?? '').trim().split(/\r?\n/)[0];
const lines = (text) => String(text).split(/\r?\n/).filter((line) => line.trim() !== '');
const fold = (path, platform) => (platform === 'win32' ? path.toLowerCase() : path);
const forward = (path) => path.replace(/\\/g, '/');

function spawn(file, args, { cwd, both = false } = {}) {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(firstLine(result.stderr) || `${file} exited with ${result.status}`);
  return both ? `${result.stdout}${result.stderr}` : result.stdout;
}

export const dockerRunner = (args, options) => spawn('docker', args, options);
export const ghRunner = (args, options) => spawn('gh', args, options);
export const gitRunner = (args, options) => spawn('git', args, options);

export function parseEnv(text) {
  const values = {};
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    values[m[1]] = value;
  }
  return values;
}

export function parseTarget(text) {
  const m = /^-(Organization|Repository)\s+(\S+)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  if (m[1] === 'Organization') return OWNER.test(m[2]) ? { scope: 'organization', target: m[2] } : null;
  return REPO.test(m[2]) ? { scope: 'repository', target: m[2] } : null;
}

export function isInside(path, parent, platform) {
  const rel = relative(fold(resolve(parent), platform), fold(resolve(path), platform));
  return rel === '' || (!/^\.\.(?:[\\/]|$)/.test(rel) && !isAbsolute(rel));
}

function insideWorkTree(file) {
  let dir = dirname(resolve(file));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return true;
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

export function overlaysOf(dir) {
  return readdirSync(dir).filter((name) => /^compose\..+\.yaml$/.test(name)).sort().map((name) => join(dir, name));
}

export function inspectFolder(dir, { platform = process.platform, env = process.env } = {}) {
  const problems = [];
  const localApp = platform === 'win32' ? env.LOCALAPPDATA : undefined;
  if (!existsSync(dir)) return { values: {}, local: {}, problems: [`${dir} does not exist`], stack: null };
  if (localApp && isInside(dir, localApp, platform)) problems.push(`${dir} is under %LOCALAPPDATA%, which the packaged desktop app redirects and Docker Desktop cannot see. Use a folder such as ~/.claudalisk/runners/<project>`);
  const envPath = join(dir, 'runners.env');
  const localPath = join(dir, 'runners.local.env');
  const values = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : null;
  const local = existsSync(localPath) ? parseEnv(readFileSync(localPath, 'utf8')) : null;
  if (!values) problems.push('runners.env is missing');
  else {
    if (!PROJECT.test(values.RUNNERS_PROJECT ?? '')) problems.push('RUNNERS_PROJECT must match ^[a-z0-9][a-z0-9_-]*$');
    const target = parseTarget(values.RUNNERS_TARGET);
    if (!target) problems.push('RUNNERS_TARGET must be "-Organization <org>" or "-Repository <owner/repo>"');
    else if (target.scope === 'organization' && !/^\d+$/.test(values.RUNNERS_GROUP_ID ?? '')) problems.push('RUNNERS_GROUP_ID must be an integer in organization mode');
    if (!DIGEST.test(values.RUNNER_IMAGE ?? '')) problems.push('RUNNER_IMAGE must be pinned by digest: <ref>@sha256:<64 hex>');
    if (!values.RUNNERS_KIT_COMMIT) problems.push('RUNNERS_KIT_COMMIT is missing: add RUNNERS_KIT_COMMIT=<commit> to runners.env, so every pin is in that file');
    else if (!COMMIT.test(values.RUNNERS_KIT_COMMIT)) problems.push('RUNNERS_KIT_COMMIT must be 40 hex characters');
  }
  if (!local) problems.push('runners.local.env is missing: it holds GITHUB_APP_ID and GITHUB_APP_KEY_FILE, and "app create" writes it');
  else {
    if (!/^\d+$/.test(local.GITHUB_APP_ID ?? '')) problems.push('GITHUB_APP_ID in runners.local.env must be digits');
    const key = local.GITHUB_APP_KEY_FILE;
    if (!key) problems.push('GITHUB_APP_KEY_FILE is missing from runners.local.env');
    else if (!isAbsolute(key)) problems.push('GITHUB_APP_KEY_FILE must be an absolute path');
    else {
      if (!isFile(key)) problems.push(`GITHUB_APP_KEY_FILE ${key} does not exist`);
      if (insideWorkTree(key)) problems.push(`GITHUB_APP_KEY_FILE ${key} is inside a git work tree. Keep the key outside any repository`);
      if (localApp && isInside(key, localApp, platform)) problems.push(`GITHUB_APP_KEY_FILE ${key} is under %LOCALAPPDATA%, which Docker Desktop cannot see from the packaged desktop app`);
    }
  }
  const target = parseTarget(values?.RUNNERS_TARGET);
  let stack = null;
  if (values && PROJECT.test(values.RUNNERS_PROJECT ?? '') && target && (target.scope === 'repository' || /^\d+$/.test(values.RUNNERS_GROUP_ID ?? ''))) {
    stack = { composeProject: values.RUNNERS_PROJECT, configDir: resolve(dir), scope: target.scope, target: target.target };
    if (target.scope === 'organization') stack.groupId = Number(values.RUNNERS_GROUP_ID);
  }
  return { values: values ?? {}, local: local ?? {}, problems, stack };
}

const getJson = (gh, path) => JSON.parse(gh(['api', path]));

function getAll(gh, path, key) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const body = getJson(gh, `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const batch = body[key] ?? [];
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

const groupPath = (stack) => `orgs/${stack.target}/actions/runner-groups/${stack.groupId}`;

function serviceOf(row) {
  const m = /(?:^|,)com\.docker\.compose\.service=([^,]*)/.exec(String(row.Labels ?? ''));
  return m ? m[1] : '';
}

function projectContainers(docker, project) {
  return lines(docker(['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{json .}}'])).map((line) => {
    const row = JSON.parse(line);
    return { name: row.Names, state: row.State, service: serviceOf(row) };
  });
}

function targets(flags, deps, { several = false } = {}) {
  const registry = readRegistry({ home: deps.home });
  const stacks = (registry.runners ?? []).filter((s) => s.configDir);
  const open = (dir, registered) => {
    const folder = inspectFolder(dir, deps);
    return { dir, folder, stack: folder.stack ?? registered ?? null };
  };
  if (flags.config) {
    const dir = resolve(flags.config);
    return [open(dir, stacks.find((s) => fold(resolve(s.configDir), deps.platform) === fold(dir, deps.platform)))];
  }
  if (flags.project) {
    const found = stacks.find((s) => s.composeProject === flags.project);
    if (!found) throw new Error(`no runner stack named ${flags.project} is registered. Registered: ${stacks.map((s) => s.composeProject).join(', ') || 'none'}. Use --config <dir>, or "adopt" or "init" first`);
    return [open(found.configDir, found)];
  }
  if (several) return stacks.map((s) => open(s.configDir, s));
  if (stacks.length === 1) return [open(stacks[0].configDir, stacks[0])];
  throw new Error(stacks.length === 0 ? 'no runner stack is registered. Use --config <dir>, or "init" or "adopt" first' : `more than one runner stack is registered (${stacks.map((s) => s.composeProject).join(', ')}). Pass --project <name> or --config <dir>`);
}

function single(flags, deps) {
  return targets(flags, deps)[0];
}

function parseFlags(args, { values = [], bools = [], positionals = 0 } = {}) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (values.includes(a)) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${a} needs a value\n${USAGE}`);
      flags[a.slice(2)] = value;
      i += 1;
    } else if (bools.includes(a)) flags[a.slice(2)] = true;
    else if (!a.startsWith('--') && rest.length < positionals) rest.push(a);
    else throw new Error(`unknown argument ${a}\n${USAGE}`);
  }
  if (rest.length < positionals) throw new Error(USAGE);
  return { flags, rest };
}

function attempt(write, label, fn) {
  try {
    fn();
  } catch (e) {
    write(`  ${label}: unknown (${firstLine(e.message)})`);
  }
}

function showStatus(item, deps) {
  const { write, docker, gh } = deps;
  const s = item.stack;
  write(s ? `stack ${s.composeProject}: ${s.scope} ${s.target}, config ${item.dir}` : `stack in ${item.dir}: unreadable`);
  for (const problem of item.folder.problems) write(`  warning: ${problem}`);
  if (!s) return;
  attempt(write, 'containers', () => {
    const rows = projectContainers(docker, s.composeProject);
    if (rows.length === 0) write('  containers: none');
    for (const row of rows) write(`  ${row.service || row.name}: ${row.state} (${row.name})`);
    write(`  supervisor: ${rows.some((r) => r.service === 'supervisor' && r.state === 'running') ? 'running' : 'not running'}`);
  });
  attempt(write, 'runners', () => {
    const prefix = item.folder.values.RUNNERS_NAME_PREFIX ?? '';
    const all = getAll(gh, s.scope === 'organization' ? `orgs/${s.target}/actions/runners` : `repos/${s.target}/actions/runners`, 'runners');
    const mine = all.filter((r) => String(r.name).startsWith(prefix));
    write(`  runners: ${mine.filter((r) => r.status === 'online').length} of ${mine.length} online (${mine.filter((r) => r.busy).length} busy)`);
    for (const r of mine) write(`  runner ${r.name}: ${r.status}, ${r.busy ? 'busy' : 'idle'}, labels ${(r.labels ?? []).map((l) => l.name).join(', ')}`);
  });
  if (s.scope === 'organization') {
    attempt(write, 'runner group', () => {
      const group = getJson(gh, groupPath(s));
      write(`  runner group ${group.name} (id ${s.groupId}): visibility ${group.visibility}, public repositories ${group.allows_public_repositories ? 'allowed' : 'not allowed'}`);
      if (group.visibility === 'selected') {
        for (const r of getAll(gh, `${groupPath(s)}/repositories`, 'repositories')) write(`  group repository ${r.full_name}: ${r.visibility ?? (r.private ? 'private' : 'public')}`);
      } else write(`  runner group ${group.name} serves all ${group.visibility === 'private' ? 'private ' : ''}repositories`);
    });
  } else {
    attempt(write, 'repository', () => {
      write(`  repository ${s.target}: ${getJson(gh, `repos/${s.target}`).private === true ? 'private' : 'PUBLIC'}`);
    });
  }
}

function status(args, deps) {
  const { flags } = parseFlags(args, { values: ['--config', '--project'] });
  const items = targets(flags, deps, { several: true });
  if (items.length === 0) deps.write('no runner stack is registered. Use "init" for a new stack or "adopt <dir>" for an existing folder');
  for (const item of items) showStatus(item, deps);
}

function refuse(message) {
  throw new Error(`${message}. Nothing was changed`);
}

function adopt(args, deps) {
  const { rest } = parseFlags(args, { positionals: 1 });
  const dir = resolve(rest[0]);
  const folder = inspectFolder(dir, deps);
  if (folder.problems.length) refuse(`${dir} cannot be adopted:\n${folder.problems.map((p) => `  - ${p}`).join('\n')}\n`.trimEnd());
  const registered = (readRegistry({ home: deps.home }).runners ?? []).find((s) => s.composeProject === folder.stack.composeProject);
  if (registered && fold(resolve(registered.configDir), deps.platform) !== fold(dir, deps.platform)) refuse(`${folder.stack.composeProject} is already registered with the config folder ${registered.configDir}`);
  let running = 0;
  try {
    running = projectContainers(deps.docker, folder.stack.composeProject).filter((c) => c.state === 'running').length;
  } catch {
    running = 0;
  }
  registerRunners(folder.stack, { home: deps.home });
  if (running) deps.write(`${running} container(s) of ${folder.stack.composeProject} are running; adopting them as they are`);
  deps.write(`adopted ${folder.stack.composeProject} (${folder.stack.scope} ${folder.stack.target}); nothing was started`);
}

function init(args, deps) {
  const { flags } = parseFlags(args, { values: ['--org', '--repo', '--kit-commit', '--image', '--dir', '--project', '--group-id', '--prefix', '--labels', '--memory'] });
  if (Boolean(flags.org) === Boolean(flags.repo)) throw new Error(`give exactly one of --org and --repo\n${USAGE}`);
  const org = Boolean(flags.org);
  const target = org ? flags.org : flags.repo;
  if (!(org ? OWNER : REPO).test(target)) refuse(`${target} is not a valid ${org ? 'organization name' : 'owner/repo'}`);
  if (!COMMIT.test(flags['kit-commit'] ?? '')) refuse('--kit-commit must be a 40 hex character commit of the runner kit');
  if (!DIGEST.test(flags.image ?? '')) refuse('--image must be pinned by digest: <ref>@sha256:<64 hex>');
  if (flags['group-id'] !== undefined && !/^\d+$/.test(flags['group-id'])) refuse('--group-id must be an integer');
  const owner = target.split('/')[0];
  const project = flags.project ?? `${(org ? target : target.split('/')[1]).toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-runners`;
  if (!PROJECT.test(project)) refuse(`${project} is not a valid Compose project name`);
  for (const name of ['project', 'prefix', 'labels', 'memory']) {
    if (flags[name] !== undefined && !SAFE_VALUE.test(flags[name])) refuse(`--${name} may hold only letters, digits, dots, commas, dashes and underscores`);
  }
  if (!SAFE_VALUE.test(flags.image.replace(/[/:@]/g, ''))) refuse('--image holds characters that cannot go into runners.env');
  if (flags.dir !== undefined && (/[\u0000-\u001f]/.test(flags.dir) || flags.dir.trim() === '')) refuse('--dir must be a plain folder path');
  const dir = resolve(flags.dir ?? join(deps.home, '.claudalisk', 'runners', project));
  const localApp = deps.platform === 'win32' ? deps.env.LOCALAPPDATA : undefined;
  if (localApp && isInside(dir, localApp, deps.platform)) refuse(`${dir} is under %LOCALAPPDATA%, which the packaged desktop app redirects and Docker Desktop cannot see`);
  const envPath = join(dir, 'runners.env');
  if (existsSync(envPath)) refuse(`${envPath} already exists. Use "adopt ${dir}" to register it`);
  const user = getJson(deps.gh, `users/${owner}`);
  let groupId = flags['group-id'];
  if (org) {
    if (user.type !== 'Organization') refuse(`${owner} is not an organization: runners can only be shared between repositories in an organization; a free org is enough, or use --repo for one stack per repository`);
    if (groupId === undefined) {
      const groups = getJson(deps.gh, `orgs/${owner}/actions/runner-groups`).runner_groups ?? [];
      const found = groups.find((g) => g.default === true);
      if (!found) refuse(`${owner} has no default runner group; pass --group-id`);
      groupId = String(found.id);
    }
  } else if (getJson(deps.gh, `repos/${target}`).private !== true) refuse(`${target} is public, and self-hosted runners must never run a public repository's jobs`);
  const entries = [
    ['RUNNERS_PROJECT', project],
    ['RUNNERS_TARGET', org ? `-Organization ${target}` : `-Repository ${target}`],
    ...(org ? [['RUNNERS_GROUP_ID', groupId]] : []),
    ['RUNNERS_NAME_PREFIX', flags.prefix ?? project],
    ['RUNNERS_LABELS', flags.labels ?? 'ci'],
    ['RUNNER_MEMORY', flags.memory ?? '4g'],
    ['RUNNER_IMAGE', flags.image],
    ['RUNNERS_KIT_COMMIT', flags['kit-commit']],
  ];
  mkdirSync(dir, { recursive: true });
  writeFileSync(envPath, `${entries.map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { flag: 'wx' });
  const w = deps.write;
  w(`wrote ${envPath}`);
  w('next steps:');
  w(`  1. node tools/runners.mjs app create --config ${dir}`);
  w(`  2. install the App on ${org ? `the organization ${target}` : `the repository ${target} only`} with the install URL that step 1 prints`);
  if (org) w(`  3. node tools/runners.mjs group --config ${dir} --apply`);
  w(`  ${org ? 4 : 3}. node tools/runners.mjs up --config ${dir}`);
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function manifestPage({ action, manifest }) {
  return `<!doctype html><html><body><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}"><noscript><button type="submit">Create the GitHub App</button></noscript></form><script>document.forms[0].submit()</script></body></html>`;
}

function waitForCode({ makeServer, state, timeoutMs, page, announce }) {
  return new Promise((resolveCode, rejectCode) => {
    let html = '';
    let timer = null;
    let server = null;
    const shutDown = () => {
      server.close();
      server.closeAllConnections?.();
    };
    const settle = (fn, value) => {
      clearTimeout(timer);
      shutDown();
      fn(value);
    };
    server = makeServer((req, res) => {
      const reply = (status, type, text, after) => {
        res.writeHead(status, { 'content-type': type });
        res.end(text, after);
      };
      if (req.headers?.host !== `127.0.0.1:${server.address().port}`) {
        reply(400, 'text/plain', 'bad host');
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/') reply(200, 'text/html; charset=utf-8', html);
      else if (url.pathname === '/callback') {
        const code = url.searchParams.get('code') ?? '';
        if (url.searchParams.get('state') !== state || !CODE.test(code)) {
          reply(400, 'text/plain', 'state mismatch');
          return;
        }
        clearTimeout(timer);
        reply(200, 'text/plain', 'The GitHub App was created. You can close this tab.', shutDown);
        resolveCode(code);
      } else reply(404, 'text/plain', 'not found');
    });
    server.on?.('error', (e) => settle(rejectCode, e));
    server.listen(0, '127.0.0.1', () => {
      html = page(server.address().port);
      announce(`http://127.0.0.1:${server.address().port}/`);
      timer = setTimeout(() => settle(rejectCode, new Error(`no callback arrived within ${Math.round(timeoutMs / 60000)} minutes. Nothing was changed`)), timeoutMs);
    });
  });
}

function mergeEnv(path, entries) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l !== '') : [];
  const kept = existing.filter((line) => !entries.some(([k]) => line.startsWith(`${k}=`)));
  writeFileSync(path, `${[...kept, ...entries.map(([k, v]) => `${k}=${v}`)].join('\n')}\n`);
}

async function appCreate(args, deps) {
  const { flags } = parseFlags(args, { values: ['--config', '--name'] });
  const item = single(flags, deps);
  const dir = item.dir;
  const localApp = deps.platform === 'win32' ? deps.env.LOCALAPPDATA : undefined;
  if (localApp && isInside(dir, localApp, deps.platform)) refuse(`${dir} is under %LOCALAPPDATA%, which Docker Desktop cannot see from the packaged desktop app`);
  const values = item.folder.values;
  const target = parseTarget(values.RUNNERS_TARGET);
  if (!existsSync(join(dir, 'runners.env')) || !PROJECT.test(values.RUNNERS_PROJECT ?? '') || !target) refuse(`${dir} needs a runners.env with RUNNERS_PROJECT and RUNNERS_TARGET first; run "init"`);
  const owner = target.target.split('/')[0];
  const inOrg = target.scope === 'organization' || getJson(deps.gh, `users/${owner}`).type === 'Organization';
  const state = deps.random();
  const action = `${inOrg ? `https://github.com/organizations/${owner}/settings/apps/new` : 'https://github.com/settings/apps/new'}?state=${state}`;
  const name = flags.name ?? `${values.RUNNERS_PROJECT} runners`;
  const code = await waitForCode({
    makeServer: deps.createServer,
    state,
    timeoutMs: deps.timeoutMs,
    announce: (url) => deps.write(`open ${url} in your browser while signed in to GitHub as an owner of ${owner}`),
    page: (port) => manifestPage({
      action,
      manifest: {
        name,
        url: PLUGIN_URL,
        hook_attributes: { active: false },
        redirect_url: `http://127.0.0.1:${port}/callback`,
        public: false,
        default_events: [],
        default_permissions: target.scope === 'organization' ? { organization_self_hosted_runners: 'write' } : { administration: 'write' },
      },
    }),
  });
  let created;
  try {
    created = JSON.parse(deps.gh(['api', '--method', 'POST', `app-manifests/${code}/conversions`]));
  } catch {
    refuse('GitHub did not accept the manifest conversion, so no App key was saved');
  }
  const { id, slug, pem } = created;
  if (!Number.isInteger(id) || typeof slug !== 'string' || !SLUG.test(slug) || typeof pem !== 'string' || pem === '') refuse('the manifest conversion answered with an unexpected shape, so no App key was saved');
  const keyPath = join(deps.home, '.config', 'claudalisk-runners', `${slug}.pem`);
  mkdirSync(dirname(keyPath), { recursive: true });
  try {
    writeFileSync(keyPath, pem, { mode: 0o600, flag: 'wx' });
  } catch {
    refuse(`the App ${slug} (id ${id}) was created, but ${keyPath} already exists or cannot be written, so its key was not saved. Generate a new key in the App's settings`);
  }
  mergeEnv(join(dir, 'runners.local.env'), [['GITHUB_APP_ID', String(id)], ['GITHUB_APP_KEY_FILE', forward(keyPath)]]);
  deps.write(`App id: ${id}`);
  deps.write(`App slug: ${slug}`);
  deps.write(`key file: ${forward(keyPath)}`);
  deps.write(`install the App: https://github.com/apps/${slug}/installations/new`);
}

function groupProblems(group) {
  const problems = [];
  if (group.visibility !== 'selected') problems.push(`visibility is ${group.visibility}, not selected`);
  if (group.allows_public_repositories) problems.push('it allows public repositories');
  return problems;
}

function groupCommand(args, deps) {
  const { flags } = parseFlags(args, { values: ['--project', '--config'], bools: ['--apply'] });
  const { stack } = single(flags, deps);
  if (!stack) refuse('the stack cannot be read from its config folder');
  if (stack.scope !== 'organization') refuse(`${stack.composeProject} is a repository stack, which has no runner group`);
  const path = groupPath(stack);
  const group = getJson(deps.gh, path);
  const problems = groupProblems(group);
  deps.write(`runner group ${group.name} (id ${stack.groupId}): visibility ${group.visibility}, public repositories ${group.allows_public_repositories ? 'allowed' : 'not allowed'}`);
  if (problems.length === 0) {
    deps.write('the group is as the runners need it');
    return;
  }
  for (const problem of problems) deps.write(`wrong: ${problem}`);
  if (!flags.apply) {
    deps.write('run again with --apply to set visibility to selected and turn public repositories off');
    return;
  }
  if (group.visibility !== 'selected') {
    const selected = getAll(deps.gh, `${path}/repositories`, 'repositories');
    if (selected.length === 0) refuse(`the group's visibility is ${group.visibility} and no repositories are selected; switching to selected would cut off every repository of ${stack.target}. Add the repositories with "enroll" first, or select them in the group's settings`);
    deps.write(`switching to selected cuts off every repository not yet selected; selected now: ${selected.map((r) => r.full_name).join(', ')}`);
  }
  deps.gh(['api', '--method', 'PATCH', path, '-f', 'visibility=selected', '-F', 'allows_public_repositories=false']);
  const after = getJson(deps.gh, path);
  deps.write(`runner group ${after.name}: visibility ${after.visibility}, public repositories ${after.allows_public_repositories ? 'allowed' : 'not allowed'}`);
}

export function stacksServing(stacks, repo) {
  const owner = repo.split('/')[0].toLowerCase();
  return (stacks ?? []).filter((s) => typeof s.target === 'string').filter((s) => (s.scope === 'organization' ? s.target.toLowerCase() === owner : s.target.toLowerCase() === repo.toLowerCase()));
}

function enroll(args, deps) {
  const { rest } = parseFlags(args, { positionals: 1 });
  const root = resolve(rest[0]);
  const config = readAppConfig(root);
  if (!config) refuse(`${join(root, '.claude', 'claudalisk.json')} is missing`);
  const repo = config.repo;
  const serving = stacksServing(readRegistry({ home: deps.home }).runners, repo);
  if (serving.length === 0) refuse(`no registered runner stack serves ${repo}. Run "init" or "adopt" for it first`);
  if (serving.length > 1) refuse(`more than one runner stack serves ${repo}: ${serving.map((s) => s.composeProject).join(', ')}`);
  const stack = serving[0];
  const info = getJson(deps.gh, `repos/${repo}`);
  if (info.private !== true) refuse(`${repo} is not private, and the shared runners serve private repositories only (CLA-0033)`);
  if (stack.scope === 'organization') {
    const members = getAll(deps.gh, `${groupPath(stack)}/repositories`, 'repositories');
    if (members.some((r) => r.id === info.id)) deps.write(`${repo} is already in the runner group of ${stack.composeProject}`);
    else {
      deps.gh(['api', '--method', 'PUT', `${groupPath(stack)}/repositories/${info.id}`]);
      deps.write(`added ${repo} to the runner group of ${stack.composeProject}`);
    }
  } else deps.write(`${repo} is served by its own stack ${stack.composeProject}; no runner group applies`);
  if (info.allow_update_branch === true) deps.write(`Update branch is already allowed on ${repo}`);
  else {
    deps.gh(['api', '--method', 'PATCH', `repos/${repo}`, '-F', 'allow_update_branch=true']);
    deps.write(`allowed Update branch on ${repo}`);
  }
}

function fetchKit(dir, values, deps) {
  const commit = values.RUNNERS_KIT_COMMIT;
  const kit = join(dir, '.kit', commit.slice(0, 12));
  const git = (args, cwd) => deps.git(args, { cwd });
  const head = () => {
    try {
      return git(['rev-parse', 'HEAD'], kit).trim();
    } catch {
      return '';
    }
  };
  if (!existsSync(join(kit, '.git'))) {
    mkdirSync(dirname(kit), { recursive: true });
    git(['clone', '--quiet', '--no-checkout', KIT_URL, kit], dir);
  }
  if (head() !== commit) {
    git(['fetch', 'origin', commit], kit);
    git(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--force', commit], kit);
  }
  if (head() !== commit) refuse(`the kit in ${kit} is not at ${commit}`);
  if (git(['status', '--porcelain'], kit).trim() !== '') refuse(`the kit in ${kit} has local changes; delete the folder and run "up" again`);
  return kit;
}

function up(args, deps) {
  const { flags } = parseFlags(args, { values: ['--project', '--config'] });
  const item = single(flags, deps);
  if (item.folder.problems.length) refuse(`${item.dir} cannot be started:\n${item.folder.problems.map((p) => `  - ${p}`).join('\n')}`);
  const stack = item.folder.stack;
  if (stack.scope === 'organization') {
    const group = getJson(deps.gh, groupPath(stack));
    if (group.allows_public_repositories) refuse(`runner group ${group.name} allows public repositories; run "group --apply" first`);
    if (group.visibility === 'all') refuse(`runner group ${group.name} has visibility all; run "group --apply" after enrolling the repositories`);
  } else if (getJson(deps.gh, `repos/${stack.target}`).private !== true) refuse(`${stack.target} is public, and self-hosted runners must never run a public repository's jobs`);
  const kit = fetchKit(item.dir, item.folder.values, deps);
  const files = [join(kit, 'compose.yaml'), ...overlaysOf(item.dir)];
  deps.docker([
    'compose',
    '-p', stack.composeProject,
    ...files.flatMap((f) => ['--file', f]),
    '--env-file', join(item.dir, 'runners.env'),
    '--env-file', join(item.dir, 'runners.local.env'),
    '--profile', 'supervisor',
    'up', '--detach', '--wait', '--remove-orphans',
  ]);
  registerRunners(stack, { home: deps.home });
  deps.write(`started ${stack.composeProject} and registered it`);
  showStatus({ ...item, stack }, deps);
}

function logs(args, deps) {
  const { flags } = parseFlags(args, { values: ['--project', '--config'] });
  const { stack } = single(flags, deps);
  if (!stack) refuse('the stack cannot be read from its config folder');
  deps.write(deps.docker(['logs', '--tail', '100', `${stack.composeProject}-supervisor-1`], { both: true }));
}

export async function main(argv, deps = {}) {
  const d = {
    docker: dockerRunner,
    gh: ghRunner,
    git: gitRunner,
    home: homedir(),
    write: console.log,
    platform: process.platform,
    env: process.env,
    createServer,
    timeoutMs: CALLBACK_TIMEOUT_MS,
    random: () => randomBytes(16).toString('hex'),
    ...deps,
  };
  const [command, ...rest] = argv;
  if (command === 'status') return status(rest, d);
  if (command === 'adopt') return adopt(rest, d);
  if (command === 'init') return init(rest, d);
  if (command === 'app' && rest[0] === 'create') return appCreate(rest.slice(1), d);
  if (command === 'group') return groupCommand(rest, d);
  if (command === 'enroll') return enroll(rest, d);
  if (command === 'up') return up(rest, d);
  if (command === 'logs') return logs(rest, d);
  throw new Error(USAGE);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
