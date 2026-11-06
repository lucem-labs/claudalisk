#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, segments, substitutions } from './shell.mjs';
import { findConfig } from './guardrail.mjs';

const MAX_DEPTH = 5;
const BASH_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const PS_SHELLS = new Set(['pwsh', 'powershell']);
const VALUED = new Set(['-R', '--repo', '--hostname']);

const REASON = 'Polling CI with a foreground gh run view or gh pr checks sends the whole context again with every check (CLA-0077). Run node scripts/verify.mjs, which waits for CI in one call, or add --watch, or run the command in the background.';

const ask = () => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: REASON },
});

function shellOf(toolName) {
  if (toolName === 'Bash') return 'bash';
  if (toolName === 'PowerShell') return 'powershell';
  return null;
}

function positionals(args) {
  const found = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUED.has(args[i])) i++;
    else if (!args[i].startsWith('-')) found.push(args[i]);
  }
  return found;
}

function polls(name, args) {
  if (name !== 'gh') return false;
  const [group, action] = positionals(args);
  const checks = (group === 'pr' && action === 'checks') || (group === 'run' && action === 'view');
  return checks && !args.some((a) => a === '--watch' || a.startsWith('--watch='));
}

function inner(name, args) {
  if (BASH_SHELLS.has(name)) {
    const at = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    return at >= 0 ? args[at + 1] : undefined;
  }
  if (PS_SHELLS.has(name)) {
    const at = args.findIndex((a) => /^-(c|command)$/i.test(a));
    return at >= 0 ? args.slice(at + 1).join(' ') : undefined;
  }
  if (name === 'eval') return args.join(' ');
  return undefined;
}

function scan(text, shell, depth) {
  if (depth > MAX_DEPTH) return false;
  for (const seg of segments(text, { shell })) {
    const { name, args } = command(seg.words, seg.quoted);
    if (polls(name, args)) return true;
    const body = inner(name, args);
    if (typeof body === 'string' && scan(body, shell, depth + 1)) return true;
  }
  return substitutions(text, shell).some((part) => scan(part, shell, depth + 1));
}

export function decide(input, deps = {}) {
  try {
    const shell = shellOf(input.tool_name);
    if (!shell) return null;
    const text = input.tool_input?.command;
    if (typeof text !== 'string' || text.trim() === '') return null;
    if (input.tool_input?.run_in_background === true) return null;
    const inApp = deps.inApp ?? ((cwd) => findConfig(cwd, deps.appConfig) !== null);
    if (!scan(text, shell, 0)) return null;
    return inApp(input.cwd ?? process.cwd()) ? ask() : null;
  } catch {
    return null;
  }
}

async function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const appConfig = await import('../tools/app-config.mjs');
    const result = decide(input, { appConfig });
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
