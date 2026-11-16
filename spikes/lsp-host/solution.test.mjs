import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chooseSolution } from './lib/solution.mjs';

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'lsp-host-solution-'));
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  return root;
}

function chosen(files, override) {
  const root = repo(files);
  try {
    const { solution, others } = chooseSolution(root, override);
    return { solution: solution && solution.slice(root.length + 1).replaceAll('\\', '/'), others: others.map((o) => o.replaceAll('\\', '/')) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a worktree under .claude is never chosen over the checkout', () => {
  assert.deepEqual(chosen([
    '.claude/worktrees/issue-1/backend/App.slnx',
    '.claude/worktrees/issue-2/backend/App.slnx',
    'backend/App.slnx',
  ]), { solution: 'backend/App.slnx', others: [] });
});

test('node_modules, bin and obj are not searched', () => {
  assert.deepEqual(chosen(['frontend/node_modules/pkg/Pkg.sln', 'backend/bin/Debug/Copy.sln', 'backend/obj/Gen.sln']), { solution: undefined, others: [] });
});

test('the shallowest solution wins, and the others are reported', () => {
  assert.deepEqual(chosen(['tools/sub/Tools.sln', 'App.sln']), { solution: 'App.sln', others: ['tools/sub/Tools.sln'] });
});

test('at the same depth an slnx wins over an sln', () => {
  assert.equal(chosen(['backend/App.sln', 'backend/App.slnx']).solution, 'backend/App.slnx');
});

test('a solution deeper than four folders is not found', () => {
  assert.equal(chosen(['a/b/c/d/e/Deep.sln']).solution, undefined);
});

test('an override picks the solution relative to the project root', () => {
  assert.deepEqual(chosen(['backend/App.slnx', 'tools/Tools.sln'], 'tools/Tools.sln'), { solution: 'tools/Tools.sln', others: [] });
});
