import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installedComments } from './check-registry.mjs';

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
