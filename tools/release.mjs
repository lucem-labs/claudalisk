import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginVersion, readJson, registryRoot, releaseRegistryUrl, repositoryRoot } from './registry.mjs';

export const scriptsPackageDir = 'packages/scripts';

export function releaseTag(version) {
  return `v${version}`;
}

export function registryItemNames(root = registryRoot) {
  const items = readJson(join(root, 'registry.json')).items ?? [];
  if (items.length === 0) throw new Error('registry/registry.json lists no items');
  return items.map((item) => item.name);
}

export function releaseItemUrls(version, names) {
  const template = releaseRegistryUrl(version);
  return names.map((name) => ({ name, url: template.replace('{name}', name) }));
}

export function scriptsPackage(root = repositoryRoot) {
  const path = join(root, scriptsPackageDir, 'package.json');
  if (!existsSync(path)) return null;
  const { name, version } = readJson(path);
  return { name, version, dir: scriptsPackageDir };
}

async function checkItem({ name, url }, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    return `${name}: ${url} could not be fetched (${error.message})`;
  }
  if (!response.ok) return `${name}: ${url} returned ${response.status}`;
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return `${name}: ${url} is not JSON`;
  }
  if (body.name !== name) return `${name}: ${url} holds the item ${JSON.stringify(body.name)}`;
  return null;
}

export async function checkReleaseItems(version, names, { fetchImpl = fetch, attempts = 5, wait = (ms) => new Promise((done) => setTimeout(done, ms)), delayMs = 15000 } = {}) {
  let pending = releaseItemUrls(version, names);
  let failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const results = await Promise.all(pending.map(async (item) => ({ item, failure: await checkItem(item, fetchImpl) })));
    failures = results.filter((result) => result.failure);
    pending = failures.map((result) => result.item);
    if (pending.length === 0 || attempt === attempts) break;
    await wait(delayMs);
  }
  return failures.map((result) => result.failure);
}

export function releaseNotes(version, names, pkg) {
  const lines = [
    `Claudalisk ${version}, from \`version\` in \`.claude-plugin/plugin.json\`.`,
    '',
    `The \`@claudalisk\` registry is served at \`${releaseRegistryUrl(version)}\`. Every item below resolved there when this release was made:`,
    '',
    ...names.map((name) => `- \`${name}\``),
  ];
  if (pkg) {
    lines.push('', `\`${pkg.name}@${pkg.version}\` is staged on npm by this workflow and awaits the owner's approval on npmjs.com before it goes live.`);
  }
  return `${lines.join('\n')}\n`;
}

export async function main(args, { root = repositoryRoot, fetchImpl = fetch, out = (text) => process.stdout.write(text), err = (text) => process.stderr.write(text), checkOptions = {} } = {}) {
  const [command] = args;
  const version = pluginVersion(root);
  if (command === 'tag') {
    out(`${releaseTag(version)}\n`);
    return 0;
  }
  const names = registryItemNames(join(root, 'registry'));
  if (command === 'check') {
    const failures = await checkReleaseItems(version, names, { fetchImpl, ...checkOptions });
    if (failures.length > 0) {
      err(`${failures.length} registry item(s) do not resolve at ${releaseTag(version)}:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
      return 1;
    }
    out(`All ${names.length} registry items resolve at ${releaseTag(version)}.\n`);
    return 0;
  }
  if (command === 'notes') {
    out(releaseNotes(version, names, scriptsPackage(root)));
    return 0;
  }
  err('Usage: node tools/release.mjs tag | check | notes\n');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
