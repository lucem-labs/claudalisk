import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const MAX_DEPTH = 4;
const SKIPPED = new Set(['node_modules', 'bin', 'obj', 'packages', 'artifacts', 'TestResults']);
const SOLUTION = /\.slnx?$/i;

function skipped(name) {
  return name.startsWith('.') || SKIPPED.has(name);
}

export function findSolutions(root, maxDepth = MAX_DEPTH) {
  const found = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isFile() && SOLUTION.test(entry.name)) found.push({ path: join(dir, entry.name), depth });
      else if (entry.isDirectory() && depth < maxDepth && !skipped(entry.name)) walk(join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

function rank(a, b) {
  if (a.depth !== b.depth) return a.depth - b.depth;
  const aSlnx = a.path.toLowerCase().endsWith('.slnx');
  const bSlnx = b.path.toLowerCase().endsWith('.slnx');
  if (aSlnx !== bSlnx) return aSlnx ? -1 : 1;
  return a.path.localeCompare(b.path);
}

export function chooseSolution(root, override) {
  if (override) return { solution: resolve(root, override), others: [] };
  const [first, ...rest] = findSolutions(root).sort(rank);
  return { solution: first?.path, others: rest.map((s) => relative(root, s.path)) };
}
