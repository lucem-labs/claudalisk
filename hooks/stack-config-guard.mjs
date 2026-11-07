#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

const REASON = (path, dir) => `${path} is inside ${dir}, the config folder of a registered runners stack (CLA-0086). Its pins and App settings decide what runs on the owner's machine, so ask the owner before changing it. node tools/runners.mjs writes the folder for a new stack.`;

const ask = (path, dir) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: REASON(path, dir) },
});

const fold = (path, platform) => (platform === 'win32' ? path.toLowerCase() : path);

function inside(path, dir, platform) {
  const rel = relative(fold(resolve(dir), platform), fold(resolve(path), platform));
  return rel === '' || (!/^\.\.(?:[\\/]|$)/.test(rel) && !isAbsolute(rel));
}

export function decide(input, deps = {}) {
  try {
    if (!TOOLS.has(input.tool_name)) return null;
    const given = input.tool_input?.file_path;
    if (typeof given !== 'string' || given === '') return null;
    const platform = deps.platform ?? process.platform;
    const path = resolve(input.cwd ?? process.cwd(), given);
    const dirs = deps.configDirs ? deps.configDirs() : [];
    const hit = dirs.find((dir) => inside(path, dir, platform));
    return hit ? ask(path, hit) : null;
  } catch {
    return null;
  }
}

async function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const { readRegistry } = await import('../tools/app-registry.mjs');
    const result = decide(input, { configDirs: () => (readRegistry({ home: homedir() }).runners ?? []).map((stack) => stack.configDir).filter(Boolean) });
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
    process.exit(0);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
