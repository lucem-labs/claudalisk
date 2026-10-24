#!/usr/bin/env node
// Checks that the ADRs in adr/ and the knowledge-skill indexes in skills/ agree.
// Usage: node tools/check-adrs.mjs [pluginRoot]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADR_FILE = /^(\d{4})-[a-z0-9-]+\.md$/;
const STATUS = /^(proposed|accepted|superseded by CLA-\d{4})$/;
// - [CLA-0001](${CLAUDE_PLUGIN_ROOT}/adr/0001-x.md) (accepted): decision.
const SKILL_LINE = /^- \[(CLA-\d{4})\]\(\$\{CLAUDE_PLUGIN_ROOT\}\/adr\/([^)]+)\) \(([^)]+)\): \S/;
const SKILL_LINK = /\$\{CLAUDE_PLUGIN_ROOT\}\/adr\/([^)\s`]+)/g;
// | [CLA-0001](0001-x.md) | Title | accepted | area |
const README_ROW = /^\| \[(CLA-\d{4})\]\(([^)]+)\) \| [^|]+ \| ([^|]+?) \| ([^|]+?) \|$/;

const field = (text, name) => text.match(new RegExp(`^- \\*\\*${name}:\\*\\* (.+)$`, 'm'))?.[1].trim();

export function readAdrs(root) {
  const dir = join(root, 'adr');
  return readdirSync(dir)
    .filter((f) => f !== 'README.md' && f.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      return {
        file,
        number: file.match(ADR_FILE)?.[1],
        id: text.match(/^# (CLA-\d{4}): \S/m)?.[1],
        status: field(text, 'Status'),
        date: field(text, 'Date'),
        area: field(text, 'Area'),
      };
    });
}

export function readSkills(root) {
  const dir = join(root, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => ({
      name: d.name,
      text: readFileSync(join(dir, d.name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n'),
    }));
}

export function checkAdrs(root) {
  const errors = [];
  const adrs = readAdrs(root);
  const skills = readSkills(root);
  const byFile = new Map(adrs.map((a) => [a.file, a]));
  const skillNames = new Set(skills.map((s) => s.name));

  for (const a of adrs) {
    if (!a.number) errors.push(`adr/${a.file}: name must be NNNN-lowercase-slug.md`);
    if (!a.id) errors.push(`adr/${a.file}: first heading must be "# CLA-NNNN: <decision>"`);
    else if (a.number && a.id !== `CLA-${a.number}`) errors.push(`adr/${a.file}: id ${a.id} doesn't match the file number ${a.number}`);
    if (!a.status || !STATUS.test(a.status)) errors.push(`adr/${a.file}: Status must be proposed, accepted or "superseded by CLA-NNNN" (got "${a.status ?? ''}")`);
    if (!a.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) errors.push(`adr/${a.file}: Date must be YYYY-MM-DD`);
    if (!a.area) errors.push(`adr/${a.file}: Area is missing`);
    else if (!skillNames.has(a.area)) errors.push(`adr/${a.file}: Area "${a.area}" is not a skill in skills/`);
  }
  const ids = adrs.map((a) => a.id).filter(Boolean);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) errors.push(`adr: ${id} is used by more than one file`);

  // adr/README.md index
  const readmePath = join(root, 'adr', 'README.md');
  const indexed = new Set();
  if (!existsSync(readmePath)) errors.push('adr/README.md is missing');
  else {
    for (const line of readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      const m = line.match(README_ROW);
      if (!m) continue;
      const [, id, file, status, area] = m;
      const adr = byFile.get(file);
      if (!adr) { errors.push(`adr/README.md: ${id} links ${file}, which doesn't exist`); continue; }
      indexed.add(file);
      if (adr.id !== id) errors.push(`adr/README.md: row ${id} links ${file}, which is ${adr.id}`);
      if (adr.status !== status) errors.push(`adr/README.md: ${id} status "${status}" doesn't match the ADR ("${adr.status}")`);
      if (adr.area !== area) errors.push(`adr/README.md: ${id} area "${area}" doesn't match the ADR ("${adr.area}")`);
    }
    for (const a of adrs) if (!indexed.has(a.file)) errors.push(`adr/README.md: ${a.id ?? a.file} has no row`);
  }

  // skill indexes
  const skillsFor = new Map(adrs.map((a) => [a.file, new Set()]));
  for (const s of skills) {
    const where = `skills/${s.name}/SKILL.md`;
    const name = s.text.match(/^---\n[\s\S]*?^name: (.+)$[\s\S]*?^---$/m)?.[1].trim();
    if (name !== s.name) errors.push(`${where}: frontmatter name "${name ?? ''}" must equal the folder name`);
    for (const [, file] of s.text.matchAll(SKILL_LINK)) {
      if (!byFile.has(file)) errors.push(`${where}: link to adr/${file} doesn't resolve`);
    }
    for (const line of s.text.split('\n')) {
      if (!line.includes('${CLAUDE_PLUGIN_ROOT}/adr/')) continue;
      const m = line.match(SKILL_LINE);
      if (!m) { errors.push(`${where}: ADR line must read "- [CLA-NNNN](\${CLAUDE_PLUGIN_ROOT}/adr/<file>) (<status>): <decision>": ${line.trim()}`); continue; }
      const [, id, file, status] = m;
      const adr = byFile.get(file);
      if (!adr) continue;
      skillsFor.get(file).add(s.name);
      if (adr.id !== id) errors.push(`${where}: ${id} links ${file}, which is ${adr.id}`);
      if (adr.status !== status) errors.push(`${where}: ${id} status "${status}" doesn't match the ADR ("${adr.status}")`);
    }
  }
  for (const a of adrs) {
    const indexedBy = skillsFor.get(a.file);
    if (indexedBy.size === 0) errors.push(`adr/${a.file}: not indexed by any skill`);
    else if (a.area && skillNames.has(a.area) && !indexedBy.has(a.area)) errors.push(`adr/${a.file}: not indexed by its own area's skill (${a.area})`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const errors = checkAdrs(root);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`\n${errors.length} ADR index problem(s).`);
    process.exit(1);
  }
  console.log(`✓ ${readAdrs(root).length} ADRs and ${readSkills(root).length} skills agree.`);
}
