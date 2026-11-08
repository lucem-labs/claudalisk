#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize as normalizePath, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, normalize, segments, substitutions } from './shell.mjs';

const HOOK = 'hook speed bump';

export const RULES = [
  { id: 1, decision: 'n/a', adr: 'CLA-0083', enforcedBy: [HOOK], summary: 'Tokenizing: split on separators, strip quotes and escapes, keep assignments, look inside substitutions and nested shells.' },
  { id: 2, decision: 'deny', adr: 'CLA-0029', enforcedBy: [HOOK], summary: 'Project resolution: the Compose project comes from -p, COMPOSE_PROJECT_NAME and the -f files.' },
  { id: 3, decision: 'deny', adr: 'CLA-0029, CLA-0033', enforcedBy: [HOOK, 'structural'], summary: 'A container tool or database client may not name a protected uat, proxy or runners resource, or point into a registered runners config folder.' },
  { id: 4, decision: 'deny', adr: 'CLA-0030, CLA-0031, CLA-0066', enforcedBy: ['guarded by the script', HOOK], summary: 'Only the guarded deploy and backup scripts run against uat; restore, init and prune-backups --apply are the owner\'s.' },
  { id: 5, decision: 'deny', adr: 'CLA-0024', enforcedBy: [HOOK], summary: 'No merging: gh pr merge, the merge API and any push to the default branch.' },
  { id: 6, decision: 'deny', adr: 'CLA-0023', enforcedBy: [HOOK, 'prompt only'], summary: 'gh pr create only when CI succeeded on the head commit.' },
  { id: 7, decision: 'deny', adr: 'CLA-0029', enforcedBy: [HOOK, 'structural'], summary: 'Destructive verbs everywhere: volume rm|prune, system prune, down -v, rm -v.' },
  { id: 8, decision: 'deny', adr: 'CLA-0066', enforcedBy: [HOOK, 'CI/test'], summary: 'No shell write of an env file with real values inside a checkout.' },
  { id: 9, decision: 'deny', adr: 'CLA-0083', enforcedBy: [HOOK], summary: 'No opaque PowerShell: -EncodedCommand and iex.' },
  { id: 10, decision: 'ask', adr: 'CLA-0026', enforcedBy: [HOOK, 'CI/test'], summary: 'Ask before git add -f of env, backup or dump files and before setting an ALLOW_UAT variable.' },
  { id: 11, decision: 'ask', adr: 'CLA-0033', enforcedBy: [HOOK], summary: 'Ask before changing a runner group\'s access or registering a repository runner through the API.' },
  { id: 12, decision: 'ask', adr: 'CLA-0083', enforcedBy: [HOOK], summary: 'Ask when a dangerous script\'s path, in a scripts directory or relative with ./ or ../, appears anywhere in a PowerShell command.' },
  { id: 13, decision: 'ask', adr: 'CLA-0033', enforcedBy: [HOOK], summary: 'Ask before node proxy.mjs recreate, which stops the URLs of every app while the shared proxy is rebuilt.' },
  { id: 14, decision: 'ask', adr: 'CLA-0010', enforcedBy: [HOOK], summary: 'Ask before dotnet ef migrations remove, which deletes a migration that may have run on uat or be tracked on origin/main.' },
  { id: 15, decision: 'ask', adr: 'CLA-0010', enforcedBy: [HOOK], summary: 'Ask before a deploy.mjs command that carries --adopt-unrecorded-migrations, which records fingerprints the owner has to vouch for.' },
  { id: 16, decision: 'ask', adr: 'CLA-0033, CLA-0086', enforcedBy: [HOOK], summary: 'Ask before runners.mjs init, up, enroll, app create or group --apply, and before a shell write into a registered runners config folder.' },
];

export function hostPath(path, platform) {
  if (platform !== 'win32') return path;
  const m = /^\/([A-Za-z])(?:\/(.*))?$/s.exec(path);
  return m ? `${m[1].toUpperCase()}:/${m[2] ?? ''}` : path;
}

const MAX_DEPTH = 5;
const CONTAINER = new Set(['docker', 'docker-compose', 'podman', 'podman-compose']);
const DATABASE = new Set(['psql', 'pg_dump', 'pg_dumpall', 'pg_restore', 'pg_basebackup', 'dropdb', 'createdb', 'vacuumdb', 'reindexdb']);
const CD = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location', 'popd', 'pop-location']);
const FILE_WRITERS = new Set(['tee', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'new-item', 'ni', 'tee-object']);
const LAST_WRITERS = new Set(['cp', 'mv', 'install', 'ln']);
const DEST_WRITERS = new Set(['copy-item', 'cpi', 'copy', 'move-item', 'move', 'mi']);
const WRAPPERS = new Set(['sudo', 'command', 'env', 'exec', 'nohup', 'time', 'xargs']);
const WRAPPER_VALUED = { sudo: 'ughpCDRTU', xargs: 'nILPsdEa', env: 'uCS', time: 'fo' };
const BASH_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const PS_SHELLS = new Set(['pwsh', 'powershell']);
const UAT_EXEMPT = new Set(['git', 'gh', 'echo', 'printf', 'grep', 'rg', 'select-string']);
const FETCHERS = new Set(['curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod']);
const KEYWORDS = new Set(['{', '!', 'if', 'then', 'elif', 'else', 'do', 'while', 'until']);
const EXPORTERS = new Set(['export', 'declare', 'typeset', 'local', 'readonly', 'set']);
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const MERGE_PATH = /\/pulls\/\d+\/merge(?![\w-])/;
const SCRIPT_SEPARATORS = /[\s'"`()<>|;&,=]+/;
const DANGEROUS_BASENAME = /^(?:merge|restore|prune-backups|init)[^\\/]*\.(?:mjs|js|ps1|sh|cmd|bat)$/i;
const OK_CONCLUSIONS = ['success', 'skipped', 'neutral'];
const SHORT_VALUED = new Set(['f', 'p', 'c', 'H', 'l']);
const LONG_VALUED = new Set(['--context', '--host', '--config', '--log-level', '--file', '--project-name', '--project-directory', '--env-file', '--profile', '--ansi', '--parallel', '--progress', '--tlscacert', '--tlscert', '--tlskey', '--workdir']);

const out = (decision, reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
});

function flag(ctx, decision, id, text) {
  const rule = RULES[id - 1];
  ctx.findings.push({ decision, reason: `Rule ${id} (${rule.adr}): ${text}` });
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lastSegment = (path) => path.split(/[\\/]/).filter(Boolean).pop() ?? '';

function exec(file, args, cwd) {
  return execFileSync(file, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
}

const realGit = (args, cwd) => exec('git', args, cwd);
const realGh = (args, cwd) => exec('gh', args, cwd);

export function protectedNames(registry, config) {
  const names = new Set();
  const add = (name) => { if (typeof name === 'string' && name !== '') names.add(name.toLowerCase()); };
  const addApp = (uat, hostPrefix) => {
    if (!uat) return;
    add(uat.composeProject);
    add(uat.volume);
    for (const volume of uat.protectedVolumes ?? []) add(volume);
    if (typeof uat.composeProject === 'string') add(uat.composeProject.replace(/-/g, '_'));
    if (hostPrefix) add(`${hostPrefix}.uat.localhost`);
  };
  for (const app of registry?.apps ?? []) addApp(app.uat, app.hostPrefix);
  if (config) addApp(config.uat, config.hostPrefix);
  add(registry?.proxy?.composeProject);
  add(registry?.proxy?.network);
  for (const stack of registry?.runners ?? []) add(stack.composeProject);
  return [...names];
}

export function findConfig(cwd, appConfig) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(appConfig.configPath(dir))) return appConfig.readAppConfig(dir);
    if (existsSync(join(dir, '.git'))) return null;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export async function realDeps() {
  let tools = null;
  let failure = null;
  try {
    tools = {
      registry: await import('../tools/app-registry.mjs'),
      appConfig: await import('../tools/app-config.mjs'),
    };
  } catch (e) {
    failure = e;
  }
  return {
    protect(cwd) {
      if (failure) throw failure;
      const config = findConfig(cwd, tools.appConfig);
      let registry;
      try {
        registry = tools.registry.readRegistry({ home: homedir() });
      } catch (error) {
        error.config = config;
        throw error;
      }
      return { names: protectedNames(registry, config), config, configDirs: (registry.runners ?? []).map((stack) => stack.configDir).filter(Boolean) };
    },
  };
}

function protection(ctx) {
  if (!ctx.protection) {
    try {
      const { names, config, configDirs } = ctx.deps.protect(ctx.root);
      ctx.protection = {
        config: config ?? null,
        configDirs: configDirs ?? [],
        matchers: names.filter(Boolean).map((name) => ({ name, re: new RegExp(`(?<![a-z0-9_-])${escapeRegExp(name)}(?![a-z0-9])`, 'i') })),
      };
    } catch (error) {
      ctx.protection = { error };
    }
  }
  return ctx.protection;
}

const firstHit = (texts, matchers) => {
  for (const text of texts) for (const m of matchers) if (m.re.test(text)) return { text, name: m.name };
  return null;
};

function lookup(ctx, local, name) {
  const key = name.toUpperCase();
  for (let i = local.length - 1; i >= 0; i--) if (local[i].name.toUpperCase() === key) return local[i].value;
  if (ctx.vars.has(key)) return ctx.vars.get(key);
  for (const [k, v] of Object.entries(ctx.deps.env ?? {})) if (k.toUpperCase() === key && v) return v;
  return undefined;
}

function expand(ctx, local, text) {
  return text.replace(/\$\{(\w+)\}|\$env:(\w+)|\$(\w+)|%(\w+)%/gi, (m, a, b, c, d) => lookup(ctx, local, a ?? b ?? c ?? d) ?? m);
}

function assign(ctx, { name, value }, persist) {
  if (/ALLOW_UAT/i.test(name)) flag(ctx, 'ask', 10, `${name} is set. Variables like it switch a uat guard off (CLA-0026). Ask the owner before setting it.`);
  if (persist) ctx.vars.set(name.toUpperCase(), value);
}

function unwrap(name, args, local) {
  let rest = args;
  while (WRAPPERS.has(name)) {
    const valued = WRAPPER_VALUED[name] ?? '';
    let i = 0;
    for (; i < rest.length; i++) {
      const a = rest[i];
      const m = name === 'env' ? ASSIGNMENT.exec(a) : null;
      if (m) { local.push({ name: m[1], value: m[2] }); continue; }
      if (a === '--') { i++; break; }
      if (!a.startsWith('-') || a === '-') break;
      if (a.length === 2 && valued.includes(a[1])) i++;
    }
    name = normalize(rest[i]);
    rest = rest.slice(i + 1);
  }
  return [name, rest];
}

function parseDocker(name, args) {
  let compose = name.endsWith('-compose');
  const projects = [];
  const files = [];
  let projectDir = null;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-') || a === '-') {
      if (!compose && a === 'compose') { compose = true; continue; }
      break;
    }
    let key = a;
    let value = null;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { key = a.slice(0, eq); value = a.slice(eq + 1); }
      else if (LONG_VALUED.has(a)) value = args[++i] ?? '';
    } else if (SHORT_VALUED.has(a[1])) {
      key = `-${a[1]}`;
      value = a.length > 2 ? a.slice(2).replace(/^=/, '') : args[++i] ?? '';
    }
    if (value === null || !compose) continue;
    if (key === '-p' || key === '--project-name') projects.push(value);
    else if (key === '-f' || key === '--file') files.push(value);
    else if (key === '--project-directory' || key === '--workdir') projectDir = value;
  }
  return { compose, sub: args[i] ?? '', rest: args.slice(i + 1), projects, files, projectDir };
}

const hasVolumes = (args) => args.some((a) => /^-[A-Za-z]*v[A-Za-z]*$/.test(a) || /^--volumes(=|$)/.test(a));

function destructive(parsed, ctx) {
  const { compose, sub, rest } = parsed;
  const bad = (what) => flag(ctx, 'deny', 7, `${what} can destroy data that CLA-0029 keeps. Remove only what you created, by name, without volumes, or ask the owner.`);
  if (compose) {
    if (sub === 'down' && hasVolumes(rest)) bad('docker compose down with -v/--volumes');
    if (sub === 'rm' && hasVolumes(rest)) bad('docker compose rm -v');
    return;
  }
  if (sub === 'volume' && ['rm', 'remove', 'prune'].includes(rest[0])) bad(`docker volume ${rest[0]}`);
  if (sub === 'system' && rest[0] === 'prune') bad('docker system prune');
  if (sub === 'rm' && hasVolumes(rest)) bad('docker rm -v');
  if (sub === 'container' && ['rm', 'remove'].includes(rest[0]) && hasVolumes(rest.slice(1))) bad('docker container rm -v');
}

function composeFileProject(file, baseDir) {
  try {
    const text = readFileSync(resolve(baseDir, file), 'utf8');
    return /^name:[ \t]*["']?([^\s"'#]+)/m.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

const slashes = (text, platform) => {
  const forward = text.replace(/\\/g, '/').replace(/\/+$/, '');
  return platform === 'win32' ? forward.toLowerCase() : forward;
};

const BARE_PATH = /^[A-Za-z]:[\\/]/;

function pathForms(text, ctx) {
  const pieces = new Set([text]);
  const bases = /^-[A-Za-z]/.test(text) ? [text, text.slice(2)] : [text];
  for (const base of bases) for (const part of base.split(/[=,]/)) for (const sub of part.split(/(?<=[^:]{2}):(?=[\\/])/)) pieces.add(sub);
  const forms = [];
  for (const piece of pieces) {
    const hosted = ctx.host(piece).replace(/^[\\/]{2}[?.][\\/]/, '');
    forms.push({ piece, hosted, absolute: isAbsolute(hosted) || BARE_PATH.test(hosted) || hosted.startsWith('/') });
  }
  return forms;
}

export function configDirHit(texts, dirs, ctx) {
  for (const dir of dirs) {
    const wanted = slashes(normalizePath(dir), ctx.platform);
    if (wanted === '') continue;
    const inside = new RegExp(`(?<![A-Za-z0-9_.~/\\-])${escapeRegExp(wanted)}(?![A-Za-z0-9_.-])`);
    for (const text of texts) {
      for (const { hosted, absolute } of pathForms(text, ctx)) {
        if (absolute) {
          if (inside.test(slashes(normalizePath(hosted), ctx.platform))) return { text, dir };
        } else if (inside.test(slashes(hosted, ctx.platform))) return { text, dir };
        else if (ctx.cwd !== null && !/^-/.test(hosted) && !/[\s$`]/.test(hosted) && hosted !== '') {
          if (inside.test(slashes(resolve(ctx.cwd, hosted), ctx.platform))) return { text, dir };
        }
      }
    }
  }
  return null;
}

function container(name, args, local, ctx) {
  const parsed = parseDocker(name, args);
  destructive(parsed, ctx);
  const envFiles = args.flatMap((a, i) => (a === '--env-file' ? [args[i + 1] ?? ''] : a.startsWith('--env-file=') ? [a.slice(11)] : []));
  const uatEnv = envFiles.find((file) => lastSegment(file).toLowerCase() === 'uat.env');
  if (uatEnv) flag(ctx, 'deny', 2, `${uatEnv} is the uat env file, so this command would run against uat (CLA-0066). Use the dev env file, or ask the owner.`);
  const state = protection(ctx);
  if (state.error) {
    flag(ctx, 'deny', 3, `the protected resources cannot be read (${state.error.message}). Fix that file, then run the command again.`);
    return;
  }
  const texts = [...args.map((a) => expand(ctx, local, a)), ...local.map((a) => `${a.name}=${a.value}`)];
  const hit = firstHit(texts, state.matchers);
  if (hit) {
    flag(ctx, 'deny', 3, `"${hit.text}" names ${hit.name}, a protected uat, proxy or runners resource (CLA-0029, CLA-0033). Work on the dev environment instead, or ask the owner.`);
    return;
  }
  const inside = configDirHit(texts, state.configDirs, ctx);
  if (inside) {
    flag(ctx, 'deny', 3, `"${inside.text}" points into ${inside.dir}, the config folder of a registered runners stack, and that bypasses the project-name check (CLA-0033, CLA-0086). Use node tools/runners.mjs, or ask the owner.`);
    return;
  }
  if (!parsed.compose) return;
  const projects = [...parsed.projects];
  const fromEnv = lookup(ctx, local, 'COMPOSE_PROJECT_NAME');
  if (fromEnv) projects.push(fromEnv);
  const here = ctx.cwd ?? ctx.root;
  const baseDir = parsed.projectDir ? resolve(here, ctx.host(parsed.projectDir)) : here;
  const files = [...parsed.files, ...(lookup(ctx, local, 'COMPOSE_FILE') ?? '').split(/[:;]/).filter(Boolean)];
  for (const file of files) {
    if (/\.uat\.ya?ml$/i.test(lastSegment(file))) {
      flag(ctx, 'deny', 2, `${file} is a uat Compose file (CLA-0029). Use the dev files, or ask the owner.`);
      return;
    }
    const named = composeFileProject(ctx.host(file), baseDir);
    if (named) projects.push(named);
  }
  const found = firstHit(projects, state.matchers);
  if (found) flag(ctx, 'deny', 2, `the Compose project resolves to ${found.text}, which is protected (CLA-0029, CLA-0033). Use the dev project, or ask the owner.`);
}

function database(args, local, ctx) {
  const state = protection(ctx);
  if (state.error) {
    flag(ctx, 'deny', 3, `the protected resources cannot be read (${state.error.message}). Fix that file, then run the command again.`);
    return;
  }
  const vars = [...ctx.vars].filter(([k]) => k.startsWith('PG')).map(([k, v]) => `${k}=${v}`);
  const texts = [...args.map((a) => expand(ctx, local, a)), ...local.map((a) => `${a.name}=${a.value}`), ...vars];
  const hit = firstHit(texts, state.matchers);
  if (hit) flag(ctx, 'deny', 3, `"${hit.text}" names ${hit.name}, a protected database (CLA-0029). Use the dev database, or ask the owner.`);
}

function parseGh(args) {
  let repo = null;
  const at = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-R' || a === '--repo') repo = args[++i];
    else if (a.startsWith('--repo=')) repo = a.slice(7);
    else if (/^-R./.test(a)) repo = a.slice(2);
    else if (!a.startsWith('-') && at.length < 2) at.push(i);
  }
  const verbAt = at[1] ?? args.length;
  return { repo, group: args[at[0]], verb: args[at[1]], rest: args.slice(verbAt + 1), afterGroup: args.slice((at[0] ?? args.length) + 1) };
}

function parseApi(args) {
  const valued = new Set(['-H', '--header', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview', '-R', '--repo']);
  const fieldFlags = new Set(['-f', '-F', '--field', '--raw-field', '--input']);
  const positionals = [];
  let method = null;
  let fields = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-X' || a === '--method') method = args[++i] ?? '';
    else if (a.startsWith('--method=')) method = a.slice(9);
    else if (/^-X./.test(a)) method = a.slice(2);
    else if (fieldFlags.has(a)) { fields = true; i++; }
    else if (/^--(field|raw-field|input)=/.test(a) || /^-[fF]./.test(a)) fields = true;
    else if (valued.has(a)) i++;
    else if (!a.startsWith('-')) positionals.push(a);
  }
  return { positionals, method, fields };
}

function ghApi(args, ctx) {
  const { positionals, method, fields } = parseApi(args);
  const path = (positionals[0] ?? '').replace(/^https:\/\/api\.github\.com\//i, '').replace(/^\/+/, '');
  const bare = path.split('?')[0];
  if (positionals.some((p) => MERGE_PATH.test(p)) || /\/merges$/.test(bare)) {
    flag(ctx, 'deny', 5, `${path} merges through the API. The owner merges pull requests (CLA-0024); report that the pull request is ready instead.`);
  }
  if (path === 'graphql' && /mergePullRequest|enablePullRequestAutoMerge/i.test(args.join(' '))) {
    flag(ctx, 'deny', 5, 'this GraphQL call merges a pull request. The owner merges (CLA-0024); report that the pull request is ready instead.');
  }
  if (/orgs\/[^/]+\/actions\/runner-groups/.test(path) && ((method && method.toUpperCase() !== 'GET') || fields)) {
    flag(ctx, 'ask', 11, `${path} changes who can use the shared runners (CLA-0033). Ask the owner before running it.`);
  }
  if (/^(repos\/[^/]+\/[^/]+|orgs\/[^/]+)\/actions\/runners(\/|$)/.test(bare) && ((method && method.toUpperCase() !== 'GET') || fields)) {
    flag(ctx, 'ask', 11, `${path} registers or removes a self-hosted runner (CLA-0033). Ask the owner before running it.`);
  }
}

function prCreate(g, ctx, cwd) {
  const args = g.rest;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return;
  if (!cwd) {
    flag(ctx, 'deny', 6, 'the hook cannot tell the directory (an earlier cd, popd or variable could not be followed), so it cannot find the head commit whose CI it must check (CLA-0023). Run gh pr create from a command that starts in the repository.');
    return;
  }
  let head = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--head' || a === '-H') head = args[++i];
    else if (a.startsWith('--head=')) head = a.slice(7);
    else if (/^-H./.test(a)) head = a.slice(2);
  }
  head = head ? head.replace(/^[^:]*:/, '') : 'HEAD';
  const deny = (text) => flag(ctx, 'deny', 6, `${text} (CLA-0023). Push the fix, run node scripts/verify.mjs until CI is green on the head commit, then open the pull request.`);
  let sha = '';
  try { sha = String(ctx.deps.git(['rev-parse', head], cwd)).trim(); } catch { sha = ''; }
  if (!sha) { deny(`could not resolve the head commit of ${head}`); return; }
  let runs;
  try {
    const body = JSON.parse(ctx.deps.gh(['api', `repos/${g.repo ?? '{owner}/{repo}'}/actions/runs?head_sha=${sha}&per_page=50`], cwd));
    runs = body.workflow_runs ?? [];
  } catch (e) {
    deny(`could not look up the CI runs for ${sha} (${e.message})`);
    return;
  }
  if (runs.length === 0) { deny(`there is no CI run on ${sha}`); return; }
  const open = runs.filter((r) => r.status !== 'completed');
  if (open.length) { deny(`CI is still running on ${sha}: ${open.map((r) => r.name).join(', ')}`); return; }
  const failed = runs.filter((r) => !OK_CONCLUSIONS.includes(r.conclusion));
  if (failed.length) deny(`CI did not succeed on ${sha}: ${failed.map((r) => `${r.name} ${r.conclusion}`).join(', ')}`);
}

function gh(args, ctx, cwd) {
  const g = parseGh(args);
  if (g.group === 'pr' && g.verb === 'merge') flag(ctx, 'deny', 5, 'gh pr merge is not for the agent. The owner merges (CLA-0024); report that the pull request is ready instead.');
  else if (g.group === 'pr' && g.verb === 'create') prCreate(g, ctx, cwd);
  else if (g.group === 'api') ghApi(g.afterGroup, ctx);
}

function parseGit(args, cwd, ctx) {
  let dir = cwd;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '-C') {
      const target = ctx.host(args[++i] ?? '.');
      dir = isAbsolute(target) ? resolve(target) : dir === null ? null : resolve(dir, target);
      continue;
    }
    if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(a)) { i++; continue; }
    if (a.startsWith('-')) continue;
    break;
  }
  return { dir, sub: args[i], rest: args.slice(i + 1) };
}

function defaultBranches(ctx, cwd) {
  if (!cwd) return ['main', 'master'];
  try {
    const ref = String(ctx.deps.git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd)).trim();
    if (ref) return [ref.replace(/^origin\//, '')];
  } catch {
    return ['main', 'master'];
  }
  return ['main', 'master'];
}

function push(args, ctx, cwd) {
  const valued = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
  const positionals = [];
  let everything = false;
  let hasRepo = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--all' || a === '--mirror') everything = true;
    else if (valued.has(a)) { if (a === '--repo') hasRepo = true; i++; }
    else if (a.startsWith('--repo=')) hasRepo = true;
    else if (!a.startsWith('-')) positionals.push(a);
  }
  const specs = hasRepo ? positionals : positionals.slice(1);
  const defaults = defaultBranches(ctx, cwd);
  const deny = (text) => flag(ctx, 'deny', 5, `${text} The owner merges into the default branch (CLA-0024). Push a feature branch and open a pull request instead.`);
  if (everything) { deny('git push --all/--mirror would update the default branch.'); return; }
  for (const spec of specs) {
    let target = spec.replace(/^\+/, '');
    if (target.includes(':')) target = target.slice(target.lastIndexOf(':') + 1);
    target = target.replace(/^refs\/heads\//, '');
    if (defaults.includes(target)) { deny(`This push updates ${target}.`); return; }
  }
  if (specs.length > 0 && !specs.some((s) => ['HEAD', '+HEAD', '@'].includes(s))) return;
  if (!cwd) {
    deny('The hook cannot tell the directory (an earlier cd, popd or variable could not be followed), so it cannot check which branch this push updates. Push an explicit HEAD:refs/heads/<branch>.');
    return;
  }
  let current = '';
  try { current = String(ctx.deps.git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim(); } catch { current = ''; }
  if (!current || current === 'HEAD') { deny('Git cannot tell the current branch, so this push may update the default branch.'); return; }
  let upstream = '';
  try { upstream = String(ctx.deps.git(['rev-parse', '--abbrev-ref', '@{upstream}'], cwd)).trim(); } catch { upstream = ''; }
  const upstreamBranch = upstream.includes('/') ? upstream.slice(upstream.indexOf('/') + 1) : upstream;
  if (defaults.includes(current) || (upstreamBranch && defaults.includes(upstreamBranch))) deny(`The current branch ${current} pushes to ${upstreamBranch || current}.`);
}

function sensitivePath(path) {
  const base = lastSegment(path).toLowerCase();
  if (base.endsWith('.example')) return false;
  return /[*?[]/.test(path) || isEnvFile(base) || /\.(sql|dump|bak|backup)$/.test(base) || /(^|[\\/])backups([\\/]|$)/i.test(path);
}

function gitAdd(args, ctx) {
  const force = args.some((a) => a === '--force' || /^-[A-Za-z]*f[A-Za-z]*$/.test(a));
  if (!force) return;
  const all = args.some((a) => a === '--all' || /^-[A-Za-z]*A[A-Za-z]*$/.test(a));
  const paths = args.filter((a) => !a.startsWith('-'));
  if (all || paths.some((p) => p === '.' || sensitivePath(p))) {
    flag(ctx, 'ask', 10, 'git add -f can commit an ignored env, backup or dump file (CLA-0026, CLA-0066). Ask the owner, or add only the source files you changed.');
  }
}

function isEnvFile(base) {
  const b = base.toLowerCase();
  return !b.endsWith('.example') && (b === '.env' || b.startsWith('.env.') || b.endsWith('.env'));
}

function inCheckout(ctx, target) {
  const expanded = target === '~' || /^~[\\/]/.test(target) ? join(ctx.home, target.slice(1)) : target;
  const hosted = ctx.host(expanded);
  if (ctx.cwd === null && !isAbsolute(hosted)) return true;
  let dir = dirname(resolve(ctx.cwd ?? ctx.root, hosted));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return true;
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

function envWrites(name, args, redirects, local, ctx) {
  const targets = redirects.filter((r) => r.op.startsWith('>') && r.target && !r.target.startsWith('&')).map((r) => r.target);
  const positionals = args.filter((a) => !a.startsWith('-'));
  if (LAST_WRITERS.has(name)) targets.push(...positionals.slice(-1));
  else if (FILE_WRITERS.has(name)) targets.push(...positionals);
  else if (DEST_WRITERS.has(name)) {
    const at = args.findIndex((a) => /^-dest/i.test(a));
    targets.push(at >= 0 ? args[at + 1] ?? '' : positionals.at(-1) ?? '');
  }
  const inPlace = (name === 'sed' || name === 'perl' || name === 'gsed') && args.some((a) => /^-[A-Za-z]*i/.test(a));
  if (inPlace) targets.push(...positionals);
  if (targets.length) {
    const dirs = protection(ctx).configDirs ?? [];
    const hit = dirs.length ? configDirHit(targets.map((t) => expand(ctx, local, t)), dirs, ctx) : null;
    if (hit) flag(ctx, 'ask', 16, `this command writes "${hit.text}" inside ${hit.dir}, the config folder of a registered runners stack (CLA-0086). Ask the owner before changing its pins or App settings.`);
  }
  for (const raw of targets) {
    const target = expand(ctx, local, raw);
    if (isEnvFile(lastSegment(target)) && inCheckout(ctx, target)) {
      flag(ctx, 'deny', 8, `writing ${target} puts real values in an env file inside a checkout (CLA-0066). The init script writes env files to ~/.claudalisk/apps/<app>/; ask the owner to run it.`);
      return;
    }
  }
}

const isPrune = (text) => /^prune-backups(\.mjs)?$/i.test(lastSegment(text));

function guardedScripts(name, args, ctx) {
  const uat = args.some((a, i) => /^--environment=uat$/i.test(a) || (a === '--environment' && /^uat$/i.test(args[i + 1] ?? '')));
  if (uat && !UAT_EXEMPT.has(name)) {
    const script = args[0] && /\.(mjs|js|cjs)$/.test(args[0]) ? args[0] : null;
    const path = script && ctx.cwd ? resolve(ctx.cwd, ctx.host(script)) : null;
    const fold = (value) => (ctx.platform === 'win32' ? value.toLowerCase() : value);
    const allowed = name === 'node' && path && ['deploy.mjs', 'backup.mjs'].some((file) => fold(path) === fold(resolve(ctx.root, 'scripts', file)));
    if (!allowed) flag(ctx, 'deny', 4, 'only node scripts/deploy.mjs and node scripts/backup.mjs, run from the app root, may use --environment uat (CLA-0030, CLA-0031). Restore and init are the owner\'s (CLA-0066); ask the owner to run it.');
  }
  if ((isPrune(name) || args.some(isPrune)) && args.includes('--apply')) {
    flag(ctx, 'deny', 4, 'prune-backups --apply deletes backups and is the owner\'s (CLA-0031). Run it without --apply to see what it would remove.');
  }
}

function proxyRecreate(name, args, ctx) {
  const isProxy = (word) => lastSegment(word).toLowerCase() === 'proxy.mjs';
  if (!(isProxy(name) || (name === 'node' && args.some(isProxy))) || !args.includes('recreate')) return;
  flag(ctx, 'ask', 13, 'proxy.mjs recreate rebuilds the shared proxy and stops the URLs of every app for a moment (CLA-0033). Ask the owner before running it.');
}

function runnersChange(name, args, ctx) {
  const isRunners = (word) => lastSegment(word).toLowerCase() === 'runners.mjs';
  const at = isRunners(name) ? -1 : args.findIndex(isRunners);
  if (!isRunners(name) && (name !== 'node' || at < 0)) return;
  const rest = args.slice(at + 1).filter((a) => !a.startsWith('--') || a === '--apply');
  const [sub, next] = rest;
  const asks = ['init', 'up', 'enroll'].includes(sub) || (sub === 'app' && next === 'create') || (sub === 'group' && rest.includes('--apply'));
  if (asks) flag(ctx, 'ask', 16, `runners.mjs ${sub} ${sub === 'app' ? 'create ' : ''}creates, starts or opens up the shared runners (CLA-0033, CLA-0086). Ask the owner before running it.`);
}

function migrationsRemove(name, args, ctx) {
  const rest = name === 'dotnet-ef' ? args : name === 'dotnet' ? args.slice(args.findIndex((a) => a === 'ef' || a === 'dotnet-ef') + 1) : null
  if (!rest || (name === 'dotnet' && !args.some((a) => a === 'ef' || a === 'dotnet-ef'))) return
  const at = rest.indexOf('migrations')
  if (at < 0 || !rest.slice(at + 1).includes('remove')) return
  flag(ctx, 'ask', 14, 'dotnet ef migrations remove deletes a migration, and an applied one is never removed (CLA-0010). Fix forward with a new migration, or ask the owner when the migration ran only on dev.')
}

function adoptUnrecorded(name, args, ctx) {
  const isDeploy = (word) => /^deploy(\.mjs)?$/i.test(lastSegment(word))
  if (!(isDeploy(name) || args.some(isDeploy)) || !args.some((a) => /^--adopt-unrecorded-migrations(=|$)/.test(a))) return
  flag(ctx, 'ask', 15, '--adopt-unrecorded-migrations records fingerprints that only the owner can vouch for (CLA-0010). Ask the owner to run the uat deploy with it.')
}

function dangerousPaths(text, ctx) {
  for (const token of text.split(SCRIPT_SEPARATORS)) {
    const cut = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'));
    if (cut < 0 || !DANGEROUS_BASENAME.test(token.slice(cut + 1))) continue;
    const dir = token.slice(0, cut + 1);
    if (/^\.\.?[\\/]/.test(dir) || dir.split(/[\\/]/).some((part) => part.toLowerCase() === 'scripts')) {
      flag(ctx, 'ask', 12, `${token} is a script path in a PowerShell command, and PowerShell runs a bare path. Ask the owner, or quote it as an argument to a command that only reads it.`);
      return;
    }
  }
}

const cleanToken = (token) => token.replace(/\\/g, '/').replace(/^\.\//, '');

function configCommands(name, args, ctx) {
  const state = protection(ctx);
  const config = state.config ?? state.error?.config;
  if (!config) return;
  const tokens = [name, ...args];
  const matches = (entry) => {
    const parts = String(entry).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0 || normalize(parts[0]) !== tokens[0]) return false;
    return parts.slice(1).every((part, k) => tokens[k + 1] !== undefined && cleanToken(part) === cleanToken(tokens[k + 1]));
  };
  if ((config.ownerOnlyCommands ?? []).some(matches)) ctx.findings.push({ decision: 'deny', reason: 'Config: this command is on the owner-only list of the app config (CLA-0082). Ask the owner to run it.' });
  else if ((config.askCommands ?? []).some(matches)) ctx.findings.push({ decision: 'ask', reason: 'Config: this command is on the ask list of the app config (CLA-0082). Ask the owner before running it.' });
}

function isEncoded(arg) {
  const m = /^[-/]([A-Za-z]+)$/.exec(arg);
  if (!m) return false;
  const word = m[1].toLowerCase();
  return 'encodedcommand'.startsWith(word) || word === 'ec';
}

function nested(name, args, seg, shell, ctx, depth) {
  if (BASH_SHELLS.has(name)) {
    const at = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
    if (at >= 0 && args[at + 1] !== undefined) evaluate(args[at + 1], 'bash', ctx, depth + 1);
  } else if (PS_SHELLS.has(name)) {
    const at = args.findIndex((a) => /^[-/]c/i.test(a) && 'command'.startsWith(a.slice(1).toLowerCase()));
    if (at >= 0) evaluate(args.slice(at + 1).join(' '), 'powershell', ctx, depth + 1);
    else if (!args.some((a) => /^[-/]f(ile)?$/i.test(a))) evaluate(args.filter((a) => !a.startsWith('-')).join(' '), 'powershell', ctx, depth + 1);
  } else if (name === 'cmd') {
    const at = args.findIndex((a) => /^\/[ck]$/i.test(a));
    if (at >= 0) evaluate(args.slice(at + 1).join(' '), undefined, ctx, depth + 1);
  } else if (name === 'eval') {
    evaluate(args.join(' '), shell, ctx, depth + 1);
  }
  const mode = PS_SHELLS.has(name) ? 'powershell' : BASH_SHELLS.has(name) ? 'bash' : null;
  if (mode) for (const body of seg.heredocs) evaluate(body, mode, ctx, depth + 1);
}

function follow(ctx, name, args, local) {
  if (name === 'popd' || name === 'pop-location') { ctx.cwd = null; return; }
  const paths = args.filter((a) => !a.startsWith('-') || a === '-');
  if (paths.length === 0) {
    if (name === 'cd' || name === 'chdir') ctx.cwd = resolve(ctx.home);
    else if (name === 'pushd') ctx.cwd = null;
    return;
  }
  if (paths.length > 1 || paths[0] === '-') { ctx.cwd = null; return; }
  let target = expand(ctx, local, paths[0]);
  if (/[$`]/.test(target)) { ctx.cwd = null; return; }
  if (target === '~' || /^~[\\/]/.test(target)) target = join(ctx.home, target.slice(1));
  target = ctx.host(target);
  if (isAbsolute(target)) ctx.cwd = resolve(target);
  else if (ctx.cwd !== null) ctx.cwd = resolve(ctx.cwd, target);
}

function segment(whole, shell, ctx, depth) {
  ctx.host = (path) => (shell === 'bash' ? hostPath(path, ctx.platform) : path);
  const last = whole.words.length - 1;
  let skip = 0;
  while (skip < last && !whole.quoted[skip]) {
    const word = whole.words[skip];
    if (KEYWORDS.has(word) || /^[\w-]+\(\)$/.test(word) || /^[^()\s]+\)$/.test(word)) skip++;
    else if (word === 'function') skip += 2;
    else if (word === 'case' && whole.words.indexOf('in', skip) > 0) skip = whole.words.indexOf('in', skip) + 1;
    else break;
  }
  skip = Math.min(skip, last);
  let seg = skip ? { ...whole, words: whole.words.slice(skip), quoted: whole.quoted.slice(skip) } : whole;
  if (shell === 'powershell') {
    const m = /^(?:\[[^\]]*\])?\$(?:(?:script|global|local|private):)?(\w+)(?:[+-]?=([\s\S]*))?$/i.exec(seg.words[0]);
    let rest = null;
    if (m && m[2] !== undefined) {
      const head = m[2];
      rest = head === '' ? { words: seg.words.slice(1), quoted: seg.quoted.slice(1) } : { words: [head, ...seg.words.slice(1)], quoted: [seg.quoted[0], ...seg.quoted.slice(1)] };
    } else if (m && /^[+-]?=$/.test(seg.words[1] ?? '')) {
      rest = { words: seg.words.slice(2), quoted: seg.quoted.slice(2) };
    }
    if (rest) {
      if (rest.words.length <= 1) {
        if (rest.words.length === 1) ctx.vars.set(m[1].toUpperCase(), rest.words[0]);
        return;
      }
      seg = { ...seg, ...rest };
    }
  }
  const words = seg.words;
  const psEnv = /^\$env:([A-Za-z_]\w*)(?:=([\s\S]*))?$/i.exec(words[0]);
  if (psEnv) {
    let value = psEnv[2];
    if (value === undefined && words[1] === '=') value = words[2] ?? '';
    else if (value === undefined && words[1]?.startsWith('=')) value = words[1].slice(1);
    if (value !== undefined) assign(ctx, { name: psEnv[1], value }, true);
    return;
  }
  const cmd = command(words, seg.quoted, { skip: [] });
  const local = [...cmd.assignments];
  const [name, args] = unwrap(cmd.name, cmd.args, local);
  if (/setenvironmentvariable/i.test(words.join(' ')) && /ALLOW_UAT/i.test(words.join(' '))) assign(ctx, { name: 'ALLOW_UAT', value: '' }, false);
  for (const a of local) assign(ctx, a, !name);
  if (EXPORTERS.has(name)) for (const a of args) { const m = ASSIGNMENT.exec(a); if (m) assign(ctx, { name: m[1], value: m[2] }, true); }
  if (name === 'setx' && args[0]) assign(ctx, { name: args[0], value: args[1] ?? '' }, true);
  if (['set-item', 'new-item', 'set-variable', 'si', 'ni'].includes(name)) {
    const at = args.findIndex((a) => /^env:(.+)$/i.test(a));
    if (at >= 0) {
      const valueAt = args.findIndex((a) => /^-value$/i.test(a));
      const value = valueAt >= 0 ? args[valueAt + 1] : args[at + 1];
      assign(ctx, { name: args[at].slice(4), value: value && !value.startsWith('-') ? value : '' }, true);
    }
  }
  envWrites(name, args, cmd.redirects, local, ctx);
  if (!name) return;
  if (CD.has(name)) {
    const piping = seg.piped || seg.after === '|';
    if (seg.after === '||' || (shell === 'powershell' && piping)) ctx.cwd = null;
    else if (!piping && seg.after !== '&') follow(ctx, name, args, local);
  }
  if (name === 'iex' || name === 'invoke-expression') flag(ctx, 'deny', 9, `${name} runs text that the hook cannot read. Run the command itself, without ${name}.`);
  if (PS_SHELLS.has(name) && args.some(isEncoded)) flag(ctx, 'deny', 9, `${name} -EncodedCommand hides what runs. Pass the command as plain text with -Command.`);
  configCommands(name, args, ctx);
  guardedScripts(name, args, ctx);
  proxyRecreate(name, args, ctx);
  runnersChange(name, args, ctx);
  migrationsRemove(name, args, ctx);
  adoptUnrecorded(name, args, ctx);
  if (CONTAINER.has(name)) container(name, args, local, ctx);
  else if (DATABASE.has(name)) database(args, local, ctx);
  else if (name === 'gh') gh(args, ctx, ctx.cwd);
  else if (name === 'git') {
    const g = parseGit(args, ctx.cwd, ctx);
    if (g.sub === 'push') push(g.rest, ctx, g.dir);
    else if (g.sub === 'add') gitAdd(g.rest, ctx);
  } else if (FETCHERS.has(name) && MERGE_PATH.test(args.join(' '))) {
    flag(ctx, 'deny', 5, 'this request merges a pull request through the API. The owner merges (CLA-0024); report that the pull request is ready instead.');
  }
  nested(name, args, seg, shell, ctx, depth);
}

function evaluate(text, shell, ctx, depth) {
  if (depth > MAX_DEPTH) {
    ctx.findings.push({ decision: 'ask', reason: `Rule 1 (CLA-0083): this command nests shells or substitutions deeper than ${MAX_DEPTH} levels, so the guardrail cannot check it. Ask the owner, or run the steps separately.` });
    return;
  }
  const saved = ctx.cwd;
  const parts = segments(text, { shell });
  if (parts.some((part) => part.split)) {
    ctx.findings.push({ decision: 'ask', reason: 'Rule 1 (CLA-0083): a line continuation inside a word can hide a command, so the guardrail cannot check it. Put the word on one line.' });
  }
  if (shell === 'powershell') dangerousPaths(text, ctx);
  for (const seg of parts) segment(seg, shell, ctx, depth);
  for (const inner of substitutions(text, shell)) evaluate(inner, shell, ctx, depth + 1);
  ctx.cwd = saved;
}

export function shellOf(toolName) {
  if (toolName === 'Bash') return 'bash';
  if (toolName === 'PowerShell') return 'powershell';
  return null;
}

export function decide(input, deps = {}) {
  try {
    const shell = shellOf(input.tool_name);
    if (!shell) return null;
    const text = input.tool_input?.command;
    if (typeof text !== 'string' || text.trim() === '') return null;
    const resolved = {
      env: process.env,
      git: realGit,
      gh: realGh,
      protect: () => { throw new Error('the protected resources were not loaded'); },
      ...deps,
    };
    const start = input.cwd ?? process.cwd();
    const ctx = { cwd: start, root: start, platform: resolved.platform ?? process.platform, host: (path) => path, deps: resolved, home: resolved.home ?? homedir(), vars: new Map(), findings: [], protection: null };
    evaluate(text, shell, ctx, 0);
    const found = ctx.findings.find((f) => f.decision === 'deny') ?? ctx.findings.find((f) => f.decision === 'ask');
    return found ? out(found.decision, found.reason) : null;
  } catch (e) {
    return out('ask', `The guardrail crashed and could not check this command (${e.message}). Run it only if you have checked it yourself.`);
  }
}

async function main() {
  let result;
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    result = decide(input, await realDeps());
  } catch (e) {
    result = out('ask', `The guardrail crashed and could not check this command (${e.message}). Run it only if you have checked it yourself.`);
  }
  if (result) process.stdout.write(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
