import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAdrs } from './check-adrs.mjs';

const adr = (id, status = 'accepted', area = 'testing') =>
  `# ${id}: A decision\n\n- **Status:** ${status}\n- **Date:** 2026-10-24\n- **Area:** ${area}\n- **Enforced by:** reviewer\n\n## Decision\n\n- Do it.\n`;
const row = (id, file, status = 'accepted', area = 'testing') => `| [${id}](${file}) | A decision | ${status} | ${area} |`;
const line = (id, file, status = 'accepted') => `- [${id}](\${CLAUDE_PLUGIN_ROOT}/adr/${file}) (${status}): do it.`;
const skill = (name, lines) => `---\nname: ${name}\ndescription: test\nuser-invocable: false\n---\n\n# ${name}\n\n${lines.join('\n')}\n`;

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'adrs-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function check(files) {
  const root = fixture(files);
  try { return checkAdrs(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const valid = () => ({
  'adr/0001-a.md': adr('CLA-0001'),
  'adr/README.md': `| ADR | Decision | Status | Area |\n|---|---|---|---|\n${row('CLA-0001', '0001-a.md')}\n`,
  'skills/testing/SKILL.md': skill('testing', [line('CLA-0001', '0001-a.md')]),
});

test('a consistent set passes', () => {
  assert.deepEqual(check(valid()), []);
});

test('the real plugin passes', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  assert.deepEqual(checkAdrs(root), []);
});

test('an ADR missing from the README index fails', () => {
  const files = valid();
  files['adr/README.md'] = '| ADR | Decision | Status | Area |\n|---|---|---|---|\n';
  assert.match(check(files).join('\n'), /CLA-0001 has no row/);
});

test('an ADR indexed by no skill fails', () => {
  const files = valid();
  files['skills/testing/SKILL.md'] = skill('testing', []);
  assert.match(check(files).join('\n'), /not indexed by any skill/);
});

test('an ADR not indexed by its own area skill fails', () => {
  const files = valid();
  files['skills/testing/SKILL.md'] = skill('testing', []);
  files['skills/workflow/SKILL.md'] = skill('workflow', [line('CLA-0001', '0001-a.md')]);
  assert.match(check(files).join('\n'), /not indexed by its own area's skill \(testing\)/);
});

test('a skill link that does not resolve fails', () => {
  const files = valid();
  files['skills/testing/SKILL.md'] = skill('testing', [line('CLA-0001', '0001-a.md'), line('CLA-0002', '0002-gone.md')]);
  assert.match(check(files).join('\n'), /adr\/0002-gone\.md doesn't resolve/);
});

test('a status mismatch in a skill or the README fails', () => {
  const files = valid();
  files['adr/0001-a.md'] = adr('CLA-0001', 'proposed');
  const errors = check(files).join('\n');
  assert.match(errors, /SKILL\.md: CLA-0001 status "accepted" doesn't match the ADR \("proposed"\)/);
  assert.match(errors, /README\.md: CLA-0001 status "accepted" doesn't match/);
});

test('an id that does not match the file number fails', () => {
  const files = valid();
  files['adr/0001-a.md'] = adr('CLA-0009');
  assert.match(check(files).join('\n'), /id CLA-0009 doesn't match the file number 0001/);
});

test('an unknown status or area fails', () => {
  const files = valid();
  files['adr/0001-a.md'] = adr('CLA-0001', 'maybe', 'nowhere');
  const errors = check(files).join('\n');
  assert.match(errors, /Status must be/);
  assert.match(errors, /Area "nowhere" is not a skill/);
});

test('a malformed ADR line in a skill fails', () => {
  const files = valid();
  files['skills/testing/SKILL.md'] = skill('testing', ['- see ${CLAUDE_PLUGIN_ROOT}/adr/0001-a.md']);
  assert.match(check(files).join('\n'), /ADR line must read/);
});

test('a skill whose name differs from its folder fails', () => {
  const files = valid();
  files['skills/testing/SKILL.md'] = skill('tests', [line('CLA-0001', '0001-a.md')]);
  assert.match(check(files).join('\n'), /frontmatter name "tests" must equal the folder name/);
});
