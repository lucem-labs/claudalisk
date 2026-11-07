import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import { runChecked } from './process.mjs'

const names = (text) => text.split('\0').map((name) => name.replace(/^\n+/, '')).filter(Boolean)

export async function trackedFiles(runner, appRoot) {
  const result = await runChecked(runner, 'git', ['ls-files', '-z'], { cwd: appRoot, what: 'git ls-files' })
  return names(result.stdout)
}

export function isRegularFile(appRoot, file) {
  try {
    return lstatSync(join(appRoot, file)).isFile()
  } catch {
    return false
  }
}

export async function isShallow(runner, appRoot) {
  const result = await runner('git', ['rev-parse', '--is-shallow-repository'], { cwd: appRoot })
  return result.code === 0 && result.stdout.trim() === 'true'
}

export async function addedSinceMain(runner, appRoot) {
  const exists = await runner('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: appRoot })
  if (exists.code !== 0) return null
  const result = await runChecked(runner, 'git', ['log', '-z', '-m', '--no-renames', '--diff-filter=A', '--name-only', '--format=', 'origin/main..HEAD'], { cwd: appRoot, what: 'git log' })
  return names(result.stdout)
}
