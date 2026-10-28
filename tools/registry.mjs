import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
export const registryRoot = join(repositoryRoot, 'registry');
export const builtRegistry = join(registryRoot, 'public', 'r');
export const sourceExtensions = ['.ts', '.tsx', '.css'];

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';
const COLOR_UTILITY = 'bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder|ring-offset|border-[trblxy]';
const RAW_PALETTE_CLASS = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${COLOR_UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`, 'g');
const ARBITRARY_COLOR = /(?<![\w-])(?:[\w-]+:)*[\w-]+-\[(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()[^\]]*\]/g;
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;

export function quoteForWindowsShell(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replaceAll('"', '""')}"` : arg;
}

export function spawnArguments(command, args, cwd, platform = process.platform) {
  if (platform === 'win32') return [[command, ...args].map(quoteForWindowsShell).join(' '), [], { cwd, stdio: 'inherit', shell: true }];
  return [command, args, { cwd, stdio: 'inherit' }];
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function shadcnVersion(root = repositoryRoot) {
  const args = readJson(join(root, '.mcp.json')).mcpServers?.shadcn?.args ?? [];
  const pinned = args.map((arg) => arg.match(/^shadcn@(\d+\.\d+\.\d+)$/)?.[1]).find(Boolean);
  if (!pinned) throw new Error('.mcp.json must start the shadcn MCP server with an exact shadcn@<version>');
  return pinned;
}

export function pluginVersion(root = repositoryRoot) {
  const version = readJson(join(root, '.claude-plugin', 'plugin.json')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('.claude-plugin/plugin.json must have a version');
  return version;
}

export function releaseRegistryUrl(version) {
  return `https://raw.githubusercontent.com/lucem-labs/claudalisk/v${version}/registry/public/r/{name}.json`;
}

export function componentsJson(registryUrl) {
  return {
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'radix-nova',
    rsc: false,
    tsx: true,
    tailwind: {
      config: '',
      css: 'src/app/styles/theme.css',
      baseColor: 'neutral',
      cssVariables: true,
      prefix: '',
    },
    iconLibrary: 'lucide',
    rtl: false,
    aliases: {
      components: '@/shared/ui',
      utils: '@/shared/lib/utils',
      ui: '@/shared/ui',
      lib: '@/shared/lib',
      hooks: '@/shared/lib/hooks',
    },
    menuColor: 'default',
    menuAccent: 'subtle',
    registries: {
      '@claudalisk': registryUrl,
    },
  };
}

export function listFiles(dir, extensions) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...listFiles(path, extensions));
    else if (extensions.some((extension) => entry.endsWith(extension))) found.push(path);
  }
  return found.sort();
}

export function registrySources(root = registryRoot) {
  return ['theme', 'lib', 'api', 'ui'].flatMap((dir) => listFiles(join(root, dir), sourceExtensions));
}

export function findComments(text) {
  const found = [];
  let line = 1;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') line++;
    if (quote) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '/' && text[i + 1] === '/') {
      found.push(line);
      while (i < text.length && text[i + 1] !== '\n') i++;
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      found.push(line);
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 1;
      for (let j = i; j < stop; j++) if (text[j] === '\n') line++;
      i = stop;
    }
  }
  return [...new Set(found)];
}

export function findRawColors(text, { css = false } = {}) {
  const lines = text.split('\n');
  const found = [];
  lines.forEach((content, index) => {
    const matches = [...content.matchAll(RAW_PALETTE_CLASS), ...content.matchAll(ARBITRARY_COLOR)].map((m) => m[0]);
    if (!css) matches.push(...[...content.matchAll(RAW_COLOR)].map((m) => m[0]));
    for (const match of matches) found.push({ line: index + 1, match });
  });
  return found;
}

export function checkRegistrySources(root = registryRoot) {
  const errors = [];
  for (const file of registrySources(root)) {
    const name = relative(root, file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const line of findComments(text)) errors.push(`registry/${name}:${line}: has a comment (CLA-0035)`);
    const isTheme = name.startsWith('theme/');
    for (const { line, match } of findRawColors(text, { css: isTheme })) {
      errors.push(`registry/${name}:${line}: uses the raw colour ${match}; use a token utility (CLA-0054)`);
    }
  }
  return errors;
}
