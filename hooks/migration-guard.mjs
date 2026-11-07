#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMigrationFile } from '../packages/scripts/src/migration-checks.mjs';

const TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

const REASON = (path) => `${path} is a migration that is already tracked on origin/main, and an applied migration is never edited (CLA-0010). Fix forward with a new migration (dotnet ef migrations add). Only when a migration has a defect that no new migration can repair, the owner approves the edit by adding a line to approved-migration-edits.txt on main: <schema>/<migration id> <sha256 of the new file> <what happened>. #<issue>. The model snapshot stays editable.`;

const deny = (path) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON(path) },
});

function realGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { code: result.status ?? 1, stdout: result.stdout ?? '' };
}

function existingFolder(path, exists) {
  let folder = dirname(path);
  while (!exists(folder) && dirname(folder) !== folder) folder = dirname(folder);
  return folder;
}

export function decide(input, deps = {}) {
  try {
    if (!TOOLS.has(input.tool_name)) return null;
    const given = input.tool_input?.file_path;
    if (typeof given !== 'string' || given === '') return null;
    const git = deps.git ?? realGit;
    const exists = deps.exists ?? existsSync;
    const path = resolve(input.cwd ?? process.cwd(), given);
    const folder = existingFolder(path, exists);
    const prefix = git(folder, ['rev-parse', '--show-prefix']);
    if (prefix.code !== 0) return null;
    const repoPath = prefix.stdout.trim() + relative(folder, path).split(sep).join('/');
    if (!isMigrationFile(repoPath)) return null;
    const listed = git(folder, ['ls-tree', '--full-tree', '--name-only', 'origin/main', '--', repoPath]);
    if (listed.code !== 0 || listed.stdout.trim() === '') return null;
    return deny(repoPath);
  } catch {
    return null;
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
