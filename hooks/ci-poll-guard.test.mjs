import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './ci-poll-guard.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ci-poll-guard.mjs');
const inApp = () => true;
const outside = () => false;

function call(command, { tool = 'Bash', background, app = inApp } = {}) {
  const tool_input = { command, ...(background === undefined ? {} : { run_in_background: background }) };
  return decide({ tool_name: tool, tool_input, cwd: '/app' }, { inApp: app });
}

function asks(result) {
  assert.ok(result, 'expected an ask');
  assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(result.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /node scripts\/verify\.mjs/);
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /CLA-0077/);
}

test('asks for a foreground gh pr checks and gh run view', () => {
  asks(call('gh pr checks 12'));
  asks(call('gh run view 99'));
  asks(call('gh -R acme/app pr checks 12'));
  asks(call('gh pr checks', { tool: 'PowerShell' }));
});

test('allows --watch', () => {
  assert.equal(call('gh pr checks 12 --watch'), null);
  assert.equal(call('gh pr checks --watch --fail-fast 12'), null);
});

test('allows a command that runs in the background', () => {
  assert.equal(call('gh pr checks 12', { background: true }), null);
  asks(call('gh pr checks 12', { background: false }));
});

test('ignores a mention inside a quoted string', () => {
  assert.equal(call('git commit -m "do not run gh pr checks"'), null);
  assert.equal(call("echo 'gh run view 1'"), null);
});

test('catches a chained command, a pipe and a nested shell', () => {
  asks(call('cd x && gh pr checks 1'));
  asks(call('gh run view 1 | head -5'));
  asks(call('bash -c "gh pr checks 1"'));
});

test('allows other gh commands', () => {
  assert.equal(call('gh run watch 1 --exit-status'), null);
  assert.equal(call('gh pr view 1'), null);
  assert.equal(call('gh run list'), null);
});

test('allows everything outside a claudalisk app', () => {
  assert.equal(call('gh pr checks 12', { app: outside }), null);
});

test('ignores other tools and empty commands', () => {
  assert.equal(call('gh pr checks 1', { tool: 'Read' }), null);
  assert.equal(call('   '), null);
});

test('fails open when the app check throws', () => {
  assert.equal(call('gh pr checks 1', { app: () => { throw new Error('boom'); } }), null);
});

test('spawned, it asks inside an app and stays silent outside, always exiting 0', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'ci-poll-'));
  try {
    const app = join(scratch, 'app');
    const plain = join(scratch, 'plain');
    mkdirSync(join(app, '.claude'), { recursive: true });
    mkdirSync(join(plain, '.git'), { recursive: true });
    writeFileSync(join(app, '.claude', 'claudalisk.json'), JSON.stringify({
      name: 'example-app',
      hostPrefix: 'example-app',
      repo: 'acme/example-app',
      databases: [{ role: 'app', envVar: 'DB' }],
      ports: { devDb: 5432, apiLocal: 5000 },
      uat: { composeProject: 'example-app-uat', volume: 'example-app-uat-data' },
    }));
    const run = (input) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });
    const input = (cwd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh pr checks 3' }, cwd });
    const inside = run(input(app));
    assert.equal(inside.status, 0, inside.stderr);
    assert.equal(JSON.parse(inside.stdout).hookSpecificOutput.permissionDecision, 'ask');
    const away = run(input(plain));
    assert.equal(away.status, 0);
    assert.equal(away.stdout, '');
    const broken = run('not json');
    assert.equal(broken.status, 0);
    assert.equal(broken.stdout, '');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
