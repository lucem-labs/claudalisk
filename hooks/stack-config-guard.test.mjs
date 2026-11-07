import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './stack-config-guard.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'stack-config-guard.mjs');
const base = mkdtempSync(join(tmpdir(), 'stack-guard-'));
const stack = join(base, 'Stack');
mkdirSync(stack);
const deps = (extra = {}) => ({ configDirs: () => [stack], ...extra });
const edit = (tool_name, file_path, cwd = base) => ({ cwd, tool_name, tool_input: { file_path } });
const verdict = (result) => result?.hookSpecificOutput?.permissionDecision ?? 'allow';

test('Edit, Write and MultiEdit into a registered config folder ask', () => {
  for (const tool of ['Edit', 'Write', 'MultiEdit']) {
    const result = decide(edit(tool, join(stack, 'runners.env')), deps());
    assert.equal(verdict(result), 'ask', tool);
    assert.match(result.hookSpecificOutput.permissionDecisionReason, /CLA-0086/);
  }
  assert.equal(verdict(decide(edit('Write', join(stack, '.kit', 'x', 'compose.yaml')), deps())), 'ask');
  assert.equal(verdict(decide(edit('Edit', 'Stack/runners.local.env'), deps())), 'ask');
  assert.equal(verdict(decide(edit('Edit', 'runners.env', stack), deps())), 'ask');
});

test('paths outside the folder, a sibling with the same prefix and other tools pass', () => {
  assert.equal(verdict(decide(edit('Edit', join(base, 'Stack2', 'runners.env')), deps())), 'allow');
  assert.equal(verdict(decide(edit('Edit', join(base, 'other.txt')), deps())), 'allow');
  assert.equal(verdict(decide(edit('Edit', join(stack, '..', 'other.txt')), deps())), 'allow');
  assert.equal(verdict(decide(edit('Read', join(stack, 'runners.env')), deps())), 'allow');
  assert.equal(verdict(decide({ tool_name: 'Edit', tool_input: {} }, deps())), 'allow');
});

test('case differs only matter off win32', () => {
  const upper = join(stack.toUpperCase(), 'runners.env');
  assert.equal(verdict(decide(edit('Edit', upper), deps({ platform: 'win32' }))), 'ask');
  assert.equal(verdict(decide(edit('Edit', upper), deps({ platform: 'linux' }))), process.platform === 'win32' ? 'ask' : 'allow');
});

test('no registered stacks, or a registry that cannot be read, never block', () => {
  assert.equal(verdict(decide(edit('Edit', join(stack, 'runners.env')), { configDirs: () => [] })), 'allow');
  assert.equal(verdict(decide(edit('Edit', join(stack, 'runners.env')), { configDirs: () => { throw new Error('corrupt'); } })), 'allow');
  assert.equal(verdict(decide(edit('Edit', join(stack, 'runners.env')), {})), 'allow');
});

test('the hook asks through the real registry and stays silent on bad input', () => {
  const home = mkdtempSync(join(tmpdir(), 'stack-guard-home-'));
  try {
    mkdirSync(join(home, '.claudalisk'));
    writeFileSync(join(home, '.claudalisk', 'apps.json'), JSON.stringify({ apps: [], runners: [{ composeProject: 'p', configDir: stack, scope: 'repository', target: 'o/r' }] }));
    const run = (input) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
    const asked = run(JSON.stringify(edit('Write', join(stack, 'runners.env'))));
    assert.equal(asked.status, 0);
    assert.equal(JSON.parse(asked.stdout).hookSpecificOutput.permissionDecision, 'ask');
    const quiet = run('not json');
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stdout, '');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a legacy runners entry without a config folder is ignored by the real hook', () => {
  const home = mkdtempSync(join(tmpdir(), 'stack-guard-legacy-'));
  try {
    mkdirSync(join(home, '.claudalisk'));
    writeFileSync(join(home, '.claudalisk', 'apps.json'), JSON.stringify({ apps: [], runners: { composeProject: 'old' } }));
    const run = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(edit('Write', join(stack, 'runners.env'))), encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
