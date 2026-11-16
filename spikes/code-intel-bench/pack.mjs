import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { git, runCaptured } from './lib.mjs'

const ID = /^[a-z0-9][a-z0-9-]*$/
const SHA = /^[0-9a-f]{40}$/
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:\/\/|[\w.-]+@[\w.-]+:)/i
const TAIL = 1500
const MARKER = 'claudalisk-bench-prepared'
export const PREPARE_TIMEOUT_MS = 30 * 60 * 1000

const inside = (path) => path !== '' && !isAbsolute(path) && !relative('.', path).startsWith('..')

function fail(folder, message) {
  throw new Error(`Pack ${folder}: ${message}`)
}

export function loadPack(folder) {
  const root = resolve(folder)
  const file = join(root, 'pack.json')
  if (!existsSync(file)) fail(root, 'pack.json is missing')
  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    fail(root, `pack.json is not valid JSON (${error.message})`)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(root, 'pack.json must hold an object')
  if (typeof data.id !== 'string' || !ID.test(data.id)) fail(root, 'id must match ^[a-z0-9][a-z0-9-]*$')
  const fixture = data.fixture
  if (!fixture || typeof fixture !== 'object') fail(root, 'fixture is missing')
  if (typeof fixture.repository !== 'string' || !fixture.repository) fail(root, 'fixture.repository must be a URL or a path')
  if (typeof fixture.commit !== 'string' || !SHA.test(fixture.commit)) fail(root, 'fixture.commit must be a full 40-character sha')
  const prepare = fixture.prepare ?? []
  if (!Array.isArray(prepare)) fail(root, 'fixture.prepare must be a list')
  for (const step of prepare) {
    if (!step || !Array.isArray(step.command) || !step.command.length || !step.command.every((part) => typeof part === 'string')) fail(root, 'each fixture.prepare step needs a command list of strings')
    if (step.cwd !== undefined && (typeof step.cwd !== 'string' || !inside(step.cwd))) fail(root, 'fixture.prepare cwd must be a folder inside the clone')
  }
  const dependencies = fixture.dependencies ?? []
  if (!Array.isArray(dependencies) || !dependencies.every((path) => typeof path === 'string' && inside(path))) fail(root, 'fixture.dependencies must be a list of folders inside the clone')
  const tasksFolder = resolve(root, typeof data.tasks === 'string' ? data.tasks : 'tasks')
  if (!existsSync(tasksFolder) || !statSync(tasksFolder).isDirectory()) fail(root, `the tasks folder ${tasksFolder} is missing`)
  const resultsFolder = resolve(root, typeof data.results === 'string' ? data.results : 'results')
  const repository = REMOTE.test(fixture.repository) ? fixture.repository : resolve(root, fixture.repository)
  return {
    id: data.id,
    folder: root,
    tasksFolder,
    resultsFolder,
    fixture: { repository, commit: fixture.commit, prepare, dependencies },
  }
}

export function packClonePath(pack) {
  return join(tmpdir(), `claudalisk-bench-pack-${pack.id}-${pack.fixture.commit.slice(0, 12)}`)
}

async function isPrepared(path, commit, dependencies) {
  if (!existsSync(path)) return false
  if (!dependencies.every((folder) => existsSync(join(path, folder)))) return false
  try {
    const markerFile = resolve(path, await git(['rev-parse', '--git-path', MARKER], path))
    if (!existsSync(markerFile) || readFileSync(markerFile, 'utf8').trim() !== commit) return false
    if ((await git(['rev-parse', 'HEAD'], path)) !== commit) return false
    const branch = await runCaptured('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: path })
    return branch.code !== 0
  } catch {
    return false
  }
}

async function isolateHistory(path) {
  const refs = await git(['for-each-ref', '--format=%(refname)'], path)
  for (const ref of refs.split('\n').filter(Boolean)) await git(['update-ref', '-d', ref], path)
  await git(['remote', 'remove', 'origin'], path)
  await git(['reflog', 'expire', '--expire=now', '--all'], path)
  await git(['gc', '--prune=now', '--quiet'], path)
}

export async function preparePackFixture(pack, { log = () => {}, timeoutMs = PREPARE_TIMEOUT_MS } = {}) {
  const { repository, commit, prepare, dependencies } = pack.fixture
  const path = packClonePath(pack)
  if (!(await isPrepared(path, commit, dependencies))) {
    rmSync(path, { recursive: true, force: true })
    log(`Preparing the clone of pack ${pack.id} at ${path}`)
    await git(['clone', '--quiet', '--no-hardlinks', repository, path], tmpdir())
    await git(['checkout', '--quiet', '--detach', commit], path)
    await isolateHistory(path)
    for (const step of prepare) {
      const [command, ...args] = step.command
      const outcome = await runCaptured(command, args, { cwd: join(path, step.cwd ?? '.'), timeoutMs })
      if (outcome.timedOut) {
        throw new Error(`Pack ${pack.id}: ${step.command.join(' ')} timed out after ${Math.round(timeoutMs / 1000)} seconds\n${`${outcome.stdout}${outcome.stderr}`.slice(-TAIL)}`)
      }
      if (outcome.code !== 0) {
        throw new Error(`Pack ${pack.id}: ${step.command.join(' ')} exited with ${outcome.code}\n${`${outcome.stdout}${outcome.stderr}`.slice(-TAIL)}`)
      }
    }
    writeFileSync(resolve(path, await git(['rev-parse', '--git-path', MARKER], path)), `${commit}\n`)
  }
  const head = await git(['rev-parse', 'HEAD'], path)
  return { path, head, dependencies, pack: pack.id, isolate: true }
}
