import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_LINES, decide, segments } from './scout-gate.mjs';

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'scout-gate-'));
  const files = {
    'src/Small.cs': lines(MAX_LINES),
    'src/Large.cs': lines(MAX_LINES + 1),
    'docs/diagram.png': lines(MAX_LINES + 1),
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function withRoot(fn) {
  const root = fixture();
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const call = (root, tool_name, tool_input, extra = {}) => decide({ cwd: root, tool_name, tool_input, ...extra }, {});
const denied = (result) => result?.hookSpecificOutput?.permissionDecision === 'deny';

test('a subagent is never gated', () => withRoot((root) => {
  assert.equal(call(root, 'Grep', { pattern: 'x' }, { agent_id: 'a1', agent_type: 'claudalisk:scout' }), null);
  assert.equal(call(root, 'Read', { file_path: 'src/Large.cs' }, { agent_id: 'a1', agent_type: 'claudalisk:implementer' }), null);
  assert.equal(call(root, 'Bash', { command: 'grep -rn x .' }, { agent_id: 'a1' }), null);
}));

test('the gate can be turned off', () => withRoot((root) => {
  assert.equal(decide({ cwd: root, tool_name: 'Glob', tool_input: { pattern: '**/*.cs' } }, { CLAUDALISK_SCOUT_GATE: 'off' }), null);
}));

test('Grep across the project is denied and names the scout', () => withRoot((root) => {
  const result = call(root, 'Grep', { pattern: 'x' });
  assert.ok(denied(result));
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /claudalisk:scout/);
  assert.ok(denied(call(root, 'Grep', { pattern: 'x', path: 'src' })));
}));

test('Grep of one file, or outside the project, is allowed', () => withRoot((root) => {
  assert.equal(call(root, 'Grep', { pattern: 'x', path: 'src/Large.cs' }), null);
  assert.equal(call(root, 'Grep', { pattern: 'x', path: join(root, '..') }), null);
}));

test('Glob in the project is denied, outside it is allowed', () => withRoot((root) => {
  assert.ok(denied(call(root, 'Glob', { pattern: '**/*.cs' })));
  assert.equal(call(root, 'Glob', { pattern: '*.md', path: join(root, '..') }), null);
}));

test('a whole-file Read of a large file is denied with its line count', () => withRoot((root) => {
  const result = call(root, 'Read', { file_path: join(root, 'src/Large.cs') });
  assert.ok(denied(result));
  assert.match(result.hookSpecificOutput.permissionDecisionReason, new RegExp(`${MAX_LINES + 1} lines`));
}));

test('ranged reads, small files, missing files, images and files outside the project are allowed', () => withRoot((root) => {
  assert.equal(call(root, 'Read', { file_path: 'src/Large.cs', offset: 10, limit: 20 }), null);
  assert.equal(call(root, 'Read', { file_path: 'src/Large.cs', limit: 20 }), null);
  assert.equal(call(root, 'Read', { file_path: 'src/Small.cs' }), null);
  assert.equal(call(root, 'Read', { file_path: 'src/Missing.cs' }), null);
  assert.equal(call(root, 'Read', { file_path: 'docs/diagram.png' }), null);
  assert.equal(call(root, 'Read', { file_path: join(root, '..', 'elsewhere.md') }), null);
}));

test('shell searches of the project are denied', () => withRoot((root) => {
  for (const command of [
    'grep -rn Foo .',
    'grep Foo src/Small.cs',
    'rg Foo',
    'cd src && rg -n "Foo|Bar"',
    'git grep Foo',
    'find . -name "*.cs"',
    'fd Large',
    'ls -R src',
    'Get-ChildItem -Recurse -Filter *.cs',
    'gci -r src',
    'Select-String -Pattern Foo -Path src/Small.cs',
    'Get-ChildItem src | Select-String Foo',
    'git ls-files | xargs grep -n Foo',
  ]) assert.ok(denied(call(root, 'Bash', { command })), command);
}));

test('shell reads of project files are denied', () => withRoot((root) => {
  for (const command of ['cat src/Small.cs', 'head -50 src/Large.cs', "sed -n '10,20p' src/Large.cs", 'Get-Content src/Large.cs -TotalCount 20', 'cat src/Small.cs 2>/dev/null']) {
    assert.ok(denied(call(root, 'Bash', { command })), command);
  }
  assert.ok(denied(call(root, 'PowerShell', { command: 'Get-Content src/Small.cs' })));
}));

test('filters, writes and commands that read no code are allowed', () => withRoot((root) => {
  for (const command of [
    'git log --oneline | head -20',
    'git status | grep src',
    'dotnet test | grep -E "Failed|Passed"',
    'ls -la src',
    'ls -ltr',
    'cat src/Small.cs > out.txt',
    "cat > src/New.cs <<'EOF'\ngrep -rn Foo .\ncat src/Large.cs\nEOF",
    'node scripts/verify.mjs -m "grep for x"',
    'echo "rg Foo; cat src/Small.cs"',
    `grep -n error ${join(root, '..', 'verify', 'job.log')}`,
    `find ${join(root, '..')} -name "*.log"`,
  ]) assert.equal(call(root, 'Bash', { command }), null, command);
}));

test('segments split on unquoted separators only, and know which take a pipe', () => {
  const words = (text) => segments(text).map((s) => s.words);
  assert.deepEqual(words('a "b|c" | d && e; f || g'), [['a', 'b|c'], ['d'], ['e'], ['f'], ['g']]);
  assert.deepEqual(words("cat <<'EOF'\nrg x\nEOF\nls"), [['cat', '<<EOF'], ['ls']]);
  assert.deepEqual(segments('a | b && c').map((s) => s.piped), [false, true, false]);
});

test('the script denies through stdout and allows with no output', () => withRoot((root) => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'scout-gate.mjs');
  const env = { ...process.env, CLAUDALISK_SCOUT_GATE: '' };
  const run = (input) => spawnSync(process.execPath, [script], { input: JSON.stringify(input), env, encoding: 'utf8' });
  const deniedRun = run({ cwd: root, tool_name: 'Glob', tool_input: { pattern: '**' } });
  assert.equal(deniedRun.status, 0);
  assert.equal(JSON.parse(deniedRun.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const allowedRun = run({ cwd: root, tool_name: 'Glob', tool_input: { pattern: '**' }, agent_id: 'a1' });
  assert.equal(allowedRun.status, 0);
  assert.equal(allowedRun.stdout, '');
  assert.equal(run('not json').stdout, '');
}));

test('quotes inside a double-quoted substitution do not end the outer quote', () => withRoot((root) => {
  const command = "git commit -m \"$(cat <<'EOF'\nsee \"grep -r x\"; \"cat hooks/hooks.json\"\nEOF\n)\"";
  assert.equal(call(root, 'Bash', { command }), null);
}));

test('a redirect of stderr before the command does not hide it', () => withRoot((root) => {
  assert.equal(call(root, 'Bash', { command: 'cat src/Small.cs' }).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(call(root, 'Bash', { command: '2>/dev/null cat src/Small.cs' }).hookSpecificOutput.permissionDecision, 'deny');
}));
