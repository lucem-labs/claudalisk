import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginVersion, repositoryRoot } from './registry.mjs';
import { releaseTag, scriptsPackage, scriptsPackageDir } from './release.mjs';
import { compareVersions, highestVersion, isVersion } from './semver.mjs';

const tagPrefix = 'v';

export function gitIn(root) {
  return (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function lines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function releasedVersions(tags) {
  const versions = [];
  const invalid = [];
  for (const tag of tags) {
    const version = tag.slice(tagPrefix.length);
    if (isVersion(version)) versions.push(version);
    else invalid.push(tag);
  }
  return { versions, invalid };
}

function invalidTagErrors(invalid) {
  return invalid.map((tag) => `the tag ${tag} is not v<version> with a Semantic Versioning 2.0.0 version (CLA-0098)`);
}

export function localTags(git) {
  return lines(git(['tag', '--list', `${tagPrefix}*`]));
}

export function remoteTags(git) {
  return lines(git(['ls-remote', '--tags', '--refs', 'origin', `refs/tags/${tagPrefix}*`])).map((line) => line.replace(/^.*refs\/tags\//, ''));
}

function readVersion(read, errors) {
  try {
    return read();
  } catch (error) {
    errors.push(error.message);
    return null;
  }
}

export function isPackageContent(path) {
  if (!path.startsWith(`${scriptsPackageDir}/`)) return false;
  const inPackage = path.slice(scriptsPackageDir.length + 1);
  if (inPackage === 'README.md') return false;
  if (inPackage.startsWith('test/')) return false;
  return !inPackage.endsWith('.test.mjs');
}

function scriptsVersionAt(git, tag) {
  let text;
  try {
    text = git(['show', `refs/tags/${tag}:${scriptsPackageDir}/package.json`]);
  } catch {
    return null;
  }
  return JSON.parse(text).version;
}

function changedPackageFiles(git, tag) {
  const tracked = lines(git(['diff', '--name-only', `refs/tags/${tag}`, '--', scriptsPackageDir]));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard', '--', scriptsPackageDir]));
  return [...new Set([...tracked, ...untracked])].filter(isPackageContent).sort();
}

function checkScriptsPackage(pkg, git, tag, errors) {
  const released = scriptsVersionAt(git, tag);
  if (released === null) return;
  if (!isVersion(released)) {
    errors.push(`${scriptsPackageDir}/package.json at ${tag} has the version ${JSON.stringify(released)}, which cannot be compared`);
    return;
  }
  const order = compareVersions(pkg.version, released);
  if (order < 0) {
    errors.push(`${pkg.name} is at ${pkg.version}, lower than ${released} at its last release ${tag}; each release is higher than the last (CLA-0098)`);
    return;
  }
  if (order > 0) return;
  const changed = changedPackageFiles(git, tag);
  if (changed.length === 0) return;
  errors.push(`${pkg.name} differs from its last release ${tag} but is still at ${released}; changed content ships only under a higher version (CLA-0098). Raise the version in ${scriptsPackageDir}/package.json. Changed: ${changed.join(', ')}`);
}

export function checkVersions(root = repositoryRoot, { git = gitIn(root) } = {}) {
  const errors = [];
  const plugin = readVersion(() => pluginVersion(root), errors);
  const pkg = readVersion(() => scriptsPackage(root), errors);
  const { versions, invalid } = releasedVersions(localTags(git));
  errors.push(...invalidTagErrors(invalid));
  const last = highestVersion(versions);
  if (last === null) {
    errors.push(`no ${tagPrefix}<version> release tag is in this clone, so the versions cannot be compared with the last release; fetch the tags (git fetch --tags)`);
    return errors;
  }
  const tag = releaseTag(last);
  if (plugin !== null && compareVersions(plugin, last) < 0) {
    errors.push(`the plugin is at ${plugin}, lower than its last release ${tag}; each release is higher than the last (CLA-0098)`);
  }
  if (pkg) checkScriptsPackage(pkg, git, tag, errors);
  return errors;
}

export function checkRelease(root = repositoryRoot, { git = gitIn(root) } = {}) {
  const errors = [];
  const plugin = readVersion(() => pluginVersion(root), errors);
  readVersion(() => scriptsPackage(root), errors);
  const { versions, invalid } = releasedVersions(remoteTags(git));
  errors.push(...invalidTagErrors(invalid));
  if (plugin === null) return errors;
  const notLower = versions.filter((version) => compareVersions(plugin, version) <= 0);
  const highest = highestVersion(notLower);
  if (highest !== null) {
    errors.push(`the plugin version ${plugin} is not higher than the existing tag ${releaseTag(highest)}; each release is higher than every earlier one (CLA-0098)`);
  }
  return errors;
}

export function main(args, { root = repositoryRoot, git = gitIn(root), out = (text) => process.stdout.write(text), err = (text) => process.stderr.write(text) } = {}) {
  const release = args.includes('--release');
  if (args.some((arg) => arg !== '--release')) {
    err('Usage: node tools/check-versions.mjs [--release]\n');
    return 2;
  }
  const errors = release ? checkRelease(root, { git }) : checkVersions(root, { git });
  if (errors.length > 0) {
    err(`${errors.map((error) => `✗ ${error}`).join('\n')}\n`);
    return 1;
  }
  out(release ? 'The plugin version is higher than every release tag.\n' : 'The plugin and scripts package versions are valid and in order with the last release.\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
