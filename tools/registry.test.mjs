import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  checkRegistrySources,
  componentsJson,
  findComments,
  findRawColors,
  pluginVersion,
  readJson,
  registryRoot,
  releaseRegistryUrl,
  repositoryRoot,
  shadcnVersion,
  spawnArguments,
} from './registry.mjs';
import { compareBuilds } from './check-registry.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'registry-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('finds line and block comments with their line numbers', () => {
  const text = 'const a = 1\n// note\nconst b = 2 /* why */\n/*\n multi\n*/\nconst c = 3 // tail\n';
  assert.deepEqual(findComments(text), [2, 3, 4, 7]);
});

test('finds a JSX comment', () => {
  assert.deepEqual(findComments('return (\n  <div>{/* hidden */}</div>\n)\n'), [2]);
});

test('ignores comment markers inside strings and template literals', () => {
  const text = 'const url = "https://example.com"\nconst glob = \'src/**/*.ts\'\nconst t = `a // b /* c */`\n';
  assert.deepEqual(findComments(text), []);
});

test('finds raw palette colours and arbitrary colour values in class names', () => {
  const found = findRawColors('<p className="text-blue-700 hover:bg-red-500/50 bg-[#1d4ed8] text-white" />').map((f) => f.match);
  assert.deepEqual(found.sort(), ['bg-[#1d4ed8]', 'hover:bg-red-500/50', 'text-blue-700', 'text-white', '#1d4ed8'].sort());
});

test('accepts token utilities', () => {
  assert.deepEqual(findRawColors('<p className="bg-primary text-muted-foreground border-border ring-ring/50 text-destructive" />'), []);
});

test('allows raw colour values in the theme file only', () => {
  assert.deepEqual(findRawColors(':root {\n  --primary: oklch(0.58 0.19 40);\n}\n', { css: true }), []);
  assert.equal(findRawColors('const color = "oklch(0.58 0.19 40)"').length, 1);
});

test('reports comments and raw colours in registry sources', () => {
  const root = fixture({
    'theme/theme.css': ':root {\n  --primary: oklch(0.5 0.1 40);\n}\n',
    'lib/a.ts': 'export const a = 1\n',
    'api/b.ts': '// note\nexport const b = 1\n',
    'ui/c.tsx': 'export const C = () => <p className="text-blue-700" />\n',
  });
  try {
    assert.deepEqual(checkRegistrySources(root), [
      'registry/api/b.ts:1: has a comment (CLA-0035)',
      'registry/ui/c.tsx:1: uses the raw colour text-blue-700; use a token utility (CLA-0054)',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the committed registry sources pass the checks', () => {
  assert.deepEqual(checkRegistrySources(), []);
});

test('components.json points the aliases into shared and the theme into app/styles', () => {
  const config = componentsJson('https://example.test/r/{name}.json');
  assert.equal(config.tailwind.css, 'src/app/styles/theme.css');
  assert.deepEqual(config.aliases, {
    components: '@/shared/ui',
    utils: '@/shared/lib/utils',
    ui: '@/shared/ui',
    lib: '@/shared/lib',
    hooks: '@/shared/lib/hooks',
  });
  assert.deepEqual(config.registries, { '@claudalisk': 'https://example.test/r/{name}.json' });
});

test('the release registry URL is pinned to the plugin version tag', () => {
  assert.equal(
    releaseRegistryUrl(pluginVersion()),
    `https://raw.githubusercontent.com/lucem-labs/claudalisk/v${pluginVersion()}/registry/public/r/{name}.json`,
  );
});

test('the plugin MCP server and the theme pin the same shadcn version', () => {
  const version = shadcnVersion();
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const theme = readJson(join(registryRoot, 'registry.json')).items.find((item) => item.name === 'theme');
  assert.ok(theme.dependencies.includes(`shadcn@${version}`));
});

test('shadcnVersion refuses an unpinned MCP server', () => {
  const root = fixture({ '.mcp.json': JSON.stringify({ mcpServers: { shadcn: { command: 'npx', args: ['shadcn@latest', 'mcp'] } } }) });
  try {
    assert.throws(() => shadcnVersion(root), /exact shadcn@<version>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the base item installs every other item', () => {
  const { items } = readJson(join(registryRoot, 'registry.json'));
  const base = items.find((item) => item.name === 'base');
  const others = items.filter((item) => item.name !== 'base').map((item) => `@claudalisk/${item.name}`);
  assert.deepEqual([...base.registryDependencies].sort(), others.sort());
});

test('quotes arguments with spaces for the Windows shell', () => {
  const [command, args, options] = spawnArguments('npx', ['build', '--output', 'C:\\Users\\A B\\r'], 'C:\\', 'win32');
  assert.equal(command, 'npx build --output "C:\\Users\\A B\\r"');
  assert.deepEqual(args, []);
  assert.equal(options.shell, true);
  assert.deepEqual(spawnArguments('npx', ['build'], '/tmp', 'linux').slice(0, 2), ['npx', ['build']]);
});

test('compareBuilds reports missing, stale and extra files', () => {
  const expected = fixture({ 'a.json': '{}', 'b.json': '{"b":1}', 'c.json': '{}' });
  const actual = fixture({ 'a.json': '{}', 'b.json': '{"b":2}', 'd.json': '{}' });
  try {
    assert.deepEqual(compareBuilds(expected, actual), [
      'registry/public/r/b.json is stale; run shadcn build',
      'registry/public/r/d.json is missing; run shadcn build',
      'registry/public/r/c.json is not built from registry.json; delete it',
    ]);
  } finally {
    rmSync(expected, { recursive: true, force: true });
    rmSync(actual, { recursive: true, force: true });
  }
});

test('the repository root holds the plugin manifest', () => {
  assert.equal(readJson(join(repositoryRoot, '.claude-plugin', 'plugin.json')).name, 'claudalisk');
});
