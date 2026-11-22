import { parseAppVersion, readAppVersion, versionFile } from '../app-version.mjs'
import { parseOptions } from '../cli.mjs'
import { fetchMain } from '../migration-checks.mjs'
import { run } from '../process.mjs'
import { compareVersions } from '../semver.mjs'

async function versionOnMain(runner, root) {
  const shown = await runner('git', ['-C', root, 'show', `origin/main:${versionFile}`])
  if (shown.code === 0) return parseAppVersion(shown.stdout, `origin/main:${versionFile}`)
  if (/does not exist in|exists on disk, but not in/.test(shown.stderr)) return null
  throw new Error(`Reading ${versionFile} from origin/main failed (${shown.stderr.trim()}), so the app version cannot be compared with it.`)
}

export async function checkVersion({ appRoot, argv, runner = run, log = console.log }) {
  parseOptions({}, argv)
  const version = readAppVersion(appRoot)
  if (version === null) {
    throw new Error(`${versionFile} in the app root has no "version". Every app carries a Semantic Versioning version there, and every pull request raises it (CLA-0099).`)
  }
  await fetchMain(runner, appRoot)
  const main = await versionOnMain(runner, appRoot)
  if (main === null) {
    log(`The app is at ${version}. origin/main has no version yet, so there is nothing to compare it with.`)
    return { version, main }
  }
  const merged = await runner('git', ['-C', appRoot, 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'])
  if (merged.code === 0) {
    log(`This commit is on origin/main, which is at ${main}.`)
    return { version, main }
  }
  if (compareVersions(version, main) <= 0) {
    throw new Error(`The app is at ${version}, which is not higher than ${main} on origin/main. Every pull request raises the version in ${versionFile} (CLA-0099): a fix raises the patch, a new capability the minor. If another pull request merged first, merge origin/main and raise it again.`)
  }
  log(`The app version ${version} is higher than ${main} on origin/main.`)
  return { version, main }
}
