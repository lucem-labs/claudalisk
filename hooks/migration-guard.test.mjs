import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './migration-guard.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'migration-guard.mjs');
const MIGRATION = 'backend/Shop/Shop.Persistence/Migrations/20260101000000_Initial.cs';
const SNAPSHOT = 'backend/Shop/Shop.Persistence/Migrations/ShopDbContextModelSnapshot.cs';
const NEW_MIGRATION = 'backend/Shop/Shop.Persistence/Migrations/20260201000000_AddOrders.cs';

function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function repo({ onMain = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'migration-guard-')));
  git(root, 'init', '--quiet');
  for (const path of [MIGRATION, SNAPSHOT]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), 'x');
  }
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'init');
  if (onMain) git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

function withRepo(options, fn) {
  const root = repo(options);
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const edit = (root, tool_name, file_path, cwd = root) => decide({ cwd, tool_name, tool_input: { file_path } });
const denied = (result) => result?.hookSpecificOutput?.permissionDecision === 'deny';

test('denies Edit, Write and MultiEdit of a migration tracked on origin/main, naming CLA-0010, the new migration and the approval path', () => withRepo({}, (root) => {
  for (const tool of ['Edit', 'Write', 'MultiEdit']) {
    const result = edit(root, tool, join(root, MIGRATION));
    assert.ok(denied(result), tool);
    assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
    const reason = result.hookSpecificOutput.permissionDecisionReason;
    assert.match(reason, /CLA-0010/);
    assert.match(reason, /Fix forward with a new migration/);
    assert.match(reason, /approved-migration-edits\.txt/);
    assert.match(reason, /<sha256 of the new file>/);
    assert.ok(reason.includes(MIGRATION));
  }
}));

test('resolves a relative path against the cwd, also from a subfolder', () => withRepo({}, (root) => {
  assert.ok(denied(edit(root, 'Edit', MIGRATION)));
  assert.ok(denied(edit(root, 'Edit', 'Shop.Persistence/Migrations/20260101000000_Initial.cs', join(root, 'backend/Shop'))));
}));

test('allows the model snapshot, a migration that is new on this branch, and any other file', () => withRepo({}, (root) => {
  assert.equal(edit(root, 'Edit', join(root, SNAPSHOT)), null);
  assert.equal(edit(root, 'Write', join(root, NEW_MIGRATION)), null);
  assert.equal(edit(root, 'Edit', join(root, 'backend/Shop/Program.cs')), null);
  assert.equal(edit(root, 'Edit', join(root, 'backend/Shop.Tests/Migrations/20260101000000_Initial.cs')), null);
}));

test('allows when origin/main does not exist or the folder is not a git repository', () => {
  withRepo({ onMain: false }, (root) => {
    assert.equal(edit(root, 'Edit', join(root, MIGRATION)), null);
  });
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'migration-guard-plain-')));
  try {
    mkdirSync(join(folder, 'backend/Shop/Migrations'), { recursive: true });
    assert.equal(edit(folder, 'Edit', join(folder, 'backend/Shop/Migrations/20260101000000_Initial.cs')), null);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('ignores other tools, missing paths and paths outside the repository', () => withRepo({}, (root) => {
  assert.equal(decide({ cwd: root, tool_name: 'Read', tool_input: { file_path: join(root, MIGRATION) } }), null);
  assert.equal(decide({ cwd: root, tool_name: 'Bash', tool_input: { command: 'echo' } }), null);
  assert.equal(decide({ cwd: root, tool_name: 'Edit', tool_input: {} }), null);
  assert.equal(decide({ cwd: root, tool_name: 'Edit' }), null);
  assert.equal(edit(root, 'Edit', join(tmpdir(), 'elsewhere', MIGRATION)), null);
}));

test('allows when git itself fails', () => {
  const failing = () => ({ code: 128, stdout: '' });
  assert.equal(decide({ cwd: '/r', tool_name: 'Edit', tool_input: { file_path: '/r/' + MIGRATION } }, { git: failing, exists: () => true }), null);
  const throwing = () => { throw new Error('boom'); };
  assert.equal(decide({ cwd: '/r', tool_name: 'Edit', tool_input: { file_path: '/r/' + MIGRATION } }, { git: throwing }), null);
});

test('as a hook process it prints the deny, and nothing for an allowed edit or bad input', () => withRepo({}, (root) => {
  const run = (input) => spawnSync('node', [SCRIPT], { input, encoding: 'utf8' });
  const blocked = run(JSON.stringify({ cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, MIGRATION) } }));
  assert.equal(blocked.status, 0);
  assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const allowed = run(JSON.stringify({ cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, SNAPSHOT) } }));
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');
  const bad = run('not json');
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
}));
