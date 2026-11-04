import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileNameErrors, installedComments, installedFileNameErrors } from './check-registry.mjs';

test('installedComments lists the comments left in the installed shared files', () => {
  const root = mkdtempSync(join(tmpdir(), 'installed-'));
  try {
    mkdirSync(join(root, 'src', 'shared', 'ui'), { recursive: true });
    mkdirSync(join(root, 'src', 'pages'), { recursive: true });
    writeFileSync(join(root, 'src', 'shared', 'ui', 'chart.tsx'), '// Upstream note.\nexport const a = 1\n');
    writeFileSync(join(root, 'src', 'shared', 'ui', 'button.tsx'), 'export const b = "https://example.com"\n');
    writeFileSync(join(root, 'src', 'pages', 'home.tsx'), '// Not installed by the scaffold.\n');

    assert.deepEqual(installedComments(root), ['src/shared/ui/chart.tsx:1']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fileNameErrors checks case collisions everywhere and kebab-case only in the ui folder', () => {
  assert.deepEqual(fileNameErrors(['registry/ui/Pager.tsx', 'registry/ui/pager.tsx', 'registry/fixture-app/README.md'], 'registry/ui/'), [
    'registry/ui/Pager.tsx and registry/ui/pager.tsx differ only by case (CLA-0053)',
    'registry/ui/Pager.tsx is not kebab-case (CLA-0053)',
  ]);
});

test('installedFileNameErrors lists non-kebab files in the installed shared/ui folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'installed-'));
  try {
    mkdirSync(join(root, 'src', 'shared', 'ui'), { recursive: true });
    mkdirSync(join(root, 'src', 'app'), { recursive: true });
    writeFileSync(join(root, 'src', 'shared', 'ui', 'NativeSelect.tsx'), 'export {}\n');
    writeFileSync(join(root, 'src', 'shared', 'ui', 'native-select.test.tsx'), 'export {}\n');
    writeFileSync(join(root, 'src', 'app', 'App.tsx'), 'export {}\n');

    assert.deepEqual(installedFileNameErrors(root), ['src/shared/ui/NativeSelect.tsx is not kebab-case (CLA-0053)']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
