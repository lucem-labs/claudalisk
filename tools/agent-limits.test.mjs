import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

const frontmatter = (text) => {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  return Object.fromEntries(block.split('\n').map((line) => line.match(/^(\w+): (.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
};

const agents = readdirSync(join(root, 'agents')).filter((f) => f.endsWith('.md'));

test('every plugin agent sets a turn cap and a compaction window that Claude Code accepts', () => {
  assert.ok(agents.length >= 2);
  for (const file of agents) {
    const fields = frontmatter(read('agents', file));
    assert.match(fields.maxTurns ?? '', /^[1-9]\d*$/, `${file} maxTurns`);
    assert.match(fields.autoCompactWindow ?? '', /^\d+$/, `${file} autoCompactWindow is a plain integer`);
    assert.ok(Number(fields.autoCompactWindow) >= 100000, `${file} autoCompactWindow is at least 100000`);
  }
});

test('the implementer and the reviewer use the limits CLA-0074 states', () => {
  const implementer = frontmatter(read('agents', 'implementer.md'));
  const reviewer = frontmatter(read('agents', 'reviewer.md'));
  assert.deepEqual([implementer.maxTurns, implementer.autoCompactWindow], ['150', '150000']);
  assert.deepEqual([reviewer.maxTurns, reviewer.autoCompactWindow], ['80', '150000']);
  const adr = read('adr', '0074-main-thread-plans-subagent-iterates.md');
  assert.match(adr, /The implementer has 150 turns and the reviewer 80, both with a 150,000-token window\./);
  assert.match(adr, /N > 11\.5 · R \/ Δ/);
});

test('no skill or workflow starts a general-purpose agent', () => {
  const files = [
    ...readdirSync(join(root, 'skills')).map((dir) => ['skills', dir, 'SKILL.md']),
    ...readdirSync(join(root, 'workflows')).filter((f) => f.endsWith('.js')).map((f) => ['workflows', f]),
  ];
  for (const parts of files) {
    let text;
    try { text = read(...parts); } catch { continue; }
    assert.doesNotMatch(text, /(subagent_type|agentType)\W+general-purpose/, parts.join('/'));
  }
});
