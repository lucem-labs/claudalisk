import { parseOptions } from '../cli.mjs'
import { reportFindings } from '../findings.mjs'
import { addedSinceMain, isShallow, trackedFiles } from '../git-files.mjs'
import { run } from '../process.mjs'

const DUMP = /\.(?:dump|pgdump|backup|bak|sql\.gz)$/

export function forbiddenReason(path) {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  const segments = normalized.split('/')
  const name = segments.at(-1)
  if (name.endsWith('.local.json')) return 'a *.local.json file'
  if (segments.slice(0, -1).includes('backups')) return 'a file in a backups folder'
  if (DUMP.test(name)) return 'a database dump or backup'
  if (!name.endsWith('.example') && (name === '.env' || name.startsWith('.env.') || name.endsWith('.env'))) return 'an env file other than *.example'
  return null
}

export async function checkForbiddenFiles({ appRoot, argv, env = process.env, runner = run, log = console.log, error = console.error, warn = log }) {
  parseOptions({}, argv)
  const findings = []
  const seen = new Set()
  const add = (file, where) => {
    const reason = forbiddenReason(file)
    if (!reason || seen.has(file)) return
    seen.add(file)
    findings.push({ file, message: `Forbidden file (CLA-0026): ${reason}, ${where}.` })
  }
  for (const file of await trackedFiles(runner, appRoot)) add(file, 'tracked')
  const inActions = env.GITHUB_ACTIONS === 'true'
  if (inActions && (await isShallow(runner, appRoot))) throw new Error('The repository is a shallow clone, so the commits of this branch cannot be checked. Fetch the full history (fetch-depth: 0).')
  const added = await addedSinceMain(runner, appRoot)
  if (added === null && inActions) throw new Error('origin/main is missing, so the commits of this branch cannot be checked. Fetch the full history (fetch-depth: 0).')
  if (added === null) {
    warn('origin/main is missing, so the commits of this branch were not checked.')
  } else {
    for (const file of added) add(file, 'added by a commit of this branch')
  }
  return reportFindings(findings, { heading: 'Forbidden files found (CLA-0026):', env, log, error })
}
