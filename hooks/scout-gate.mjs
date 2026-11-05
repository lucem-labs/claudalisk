#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, segments } from './shell.mjs';

export { segments };

export const MAX_LINES = 300;

const UNCOUNTED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf', '.ipynb']);
const SEARCHES = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'select-string', 'sls']);
const FINDERS = new Set(['find', 'fd', 'tree']);
const LISTERS = new Set(['ls', 'dir', 'get-childitem', 'gci']);
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'get-content', 'gc']);

function recursiveSearch(args) {
  return args.some((a) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || a === '--recursive');
}

function recursiveList(name, args) {
  return args.some((a) => /^-[a-zA-Z]*R[a-zA-Z]*$/.test(a) || /^-rec/i.test(a) || a === '--recursive' || (name.startsWith('g') && /^-r$/i.test(a)));
}

const SCOUT = 'Send code search and exploratory reads to the claudalisk:scout agent (CLA-0080): ask it one question, and it returns paths, lines and short excerpts.';
const reasons = {
  search: `${SCOUT} The main thread may Grep only the one file it is about to edit.`,
  glob: `${SCOUT} Finding files is exploration.`,
  shellSearch: `${SCOUT} Searching from a shell fills the main thread's context with every match.`,
  shellRead: (path) => `Read ${path} with the Read tool and an offset and limit, not from a shell (CLA-0078), or ask the claudalisk:scout agent what is in it (CLA-0080).`,
  largeRead: (path, lines) => `${path} has ${lines} lines. Read only the lines you need with offset and limit (CLA-0078), or ask the claudalisk:scout agent what is in it (CLA-0080).`,
};

const allow = () => null;
const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

function lineCount(path) {
  const text = readFileSync(path, 'utf8');
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function searchOperands(name, args) {
  const positional = args.filter((a) => !a.startsWith('-'));
  if (name === 'select-string' || name === 'sls') {
    const at = args.findIndex((a) => /^-(literal)?path$/i.test(a));
    return at >= 0 ? args.slice(at + 1, at + 2) : positional.slice(1);
  }
  return args.some((a) => /^(-e|-f|--regexp|--file)$/.test(a)) ? positional : positional.slice(1);
}

function shellDecision(input) {
  const cwd = input.cwd ?? process.cwd();
  let previous = '';
  for (const { words, piped } of segments(String(input.tool_input?.command ?? ''))) {
    const { name, args, redirected } = command(words);
    const readsFiles = !piped || words.includes('xargs') || LISTERS.has(previous);
    previous = name;
    const where = (operands) => {
      const paths = operands.map((a) => resolve(cwd, a));
      return { local: paths.filter((p) => inside(cwd, p) && existsSync(p)), elsewhere: paths.some((p) => !inside(cwd, p)) };
    };
    const { local, elsewhere } = where(args.filter((a) => !a.startsWith('-')));
    if (name === 'git' && args[0] === 'grep') return deny(reasons.shellSearch);
    if (FINDERS.has(name) && !elsewhere) return deny(reasons.shellSearch);
    if (LISTERS.has(name) && recursiveList(name, args) && !elsewhere) return deny(reasons.shellSearch);
    if (SEARCHES.has(name)) {
      const targets = where(searchOperands(name, args));
      if (targets.local.length > 0 || (!targets.elsewhere && (readsFiles || recursiveSearch(args)))) return deny(reasons.shellSearch);
    }
    if (redirected) continue;
    const file = local.find(isFile);
    if (file && (READERS.has(name) || (name === 'sed' && args.includes('-n')))) return deny(reasons.shellRead(relative(cwd, file)));
  }
  return allow();
}

export function decide(input, env = process.env) {
  if (input.agent_id) return allow();
  if (env.CLAUDALISK_SCOUT_GATE === 'off') return allow();
  const cwd = input.cwd ?? process.cwd();
  const tool = input.tool_input ?? {};
  switch (input.tool_name) {
    case 'Grep': {
      const path = resolve(cwd, tool.path ?? '.');
      if (!inside(cwd, path) || isFile(path)) return allow();
      return deny(reasons.search);
    }
    case 'Glob':
      return inside(cwd, resolve(cwd, tool.path ?? '.')) ? deny(reasons.glob) : allow();
    case 'Read': {
      if (tool.offset != null || tool.limit != null || !tool.file_path) return allow();
      const path = resolve(cwd, tool.file_path);
      if (!inside(cwd, path) || UNCOUNTED.has(extname(path).toLowerCase()) || !isFile(path)) return allow();
      const lines = lineCount(path);
      return lines > MAX_LINES ? deny(reasons.largeRead(relative(cwd, path), lines)) : allow();
    }
    case 'Bash':
    case 'PowerShell':
      return shellDecision(input);
    default:
      return allow();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = decide(JSON.parse(readFileSync(0, 'utf8')));
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
    process.exit(0);
  }
}
