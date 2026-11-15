import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, relative } from 'node:path'
import { READY, locationKeys, removeApp } from '../../lsp-host/lib/runner.mjs'
import { DIAGNOSTIC_CASES, prepareApp, waitReady } from './cases.mjs'
import { LANGUAGES, SETUPS, chosenRoslynArgs, startSetup } from './setups.mjs'
import { globalDotnetTool, launchServer, pickSolution } from './launch.mjs'
import { insideRoot, log, now, round, uriInsideRoot } from './common.mjs'
import { EmulatedClient } from './claude-code-client.mjs'

const identity = ['-c', 'user.name=claudalisk', '-c', 'user.email=claudalisk@example.com']

function git(args, cwd) {
  const result = spawnSync('git', [...identity, ...args], { cwd, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

export function linkFrontendModules(base, root) {
  const link = join(root, 'frontend', 'node_modules')
  if (!existsSync(link)) symlinkSync(join(base, 'frontend', 'node_modules'), link, 'junction')
}

export function createWorktrees(base, work) {
  git(['add', '--all'], base)
  git(['commit', '--quiet', '--allow-empty', '--message', 'Add the language-server cases'], base)
  const inside = join(base, '.claude', 'worktrees', 'B')
  const sibling = join(work, 'worktree-C')
  mkdirSync(join(base, '.claude', 'worktrees'), { recursive: true })
  git(['worktree', 'add', '--detach', inside], base)
  git(['worktree', 'add', '--detach', sibling], base)
  const roots = { A: base, B: inside, C: sibling }
  for (const root of Object.values(roots)) {
    linkFrontendModules(base, root)
    prepareApp(root)
  }
  return roots
}

export function removeWorktrees(base, roots) {
  for (const name of ['B', 'C']) {
    rmSync(join(roots[name], 'frontend', 'node_modules'), { force: true, recursive: false, maxRetries: 3 })
    try {
      git(['worktree', 'remove', '--force', roots[name]], base)
    } catch {
      removeApp(roots[name])
    }
  }
}

function countSolutions(folder, depth = 6) {
  const found = []
  const walk = (dir, level) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isFile() && /\.slnx?$/i.test(entry.name)) found.push(relative(folder, join(dir, entry.name)).replaceAll('\\', '/'))
      else if (entry.isDirectory() && level < depth && !['node_modules', 'bin', 'obj', '.git'].includes(entry.name)) walk(join(dir, entry.name), level + 1)
    }
  }
  walk(folder, 0)
  return found
}

const nestedWorktrees = (root) => join(root, '.claude', 'worktrees')
const ownPath = (root, path) => insideRoot(root, path) && !insideRoot(nestedWorktrees(root), path)
const ownUri = (root, uri) => uriInsideRoot(root, uri) && !uriInsideRoot(nestedWorktrees(root), uri)

function logLines(client, pattern) {
  return client.client.notifications
    .filter((n) => n.method === 'window/logMessage' || n.method === 'window/showMessage')
    .map((n) => String(n.params?.message ?? ''))
    .filter((line) => pattern.test(line))
    .slice(0, 6)
    .map((line) => line.replace(/\s+/g, ' ').slice(0, 300))
}

async function stopQuietly(started) {
  if (!started) return
  try {
    await started.client.stop()
  } catch {
    started.client.client?.child?.kill()
  }
}

async function isolationOne({ setup, language, root, roslynArgs }) {
  const record = { root: root.name }
  let started
  try {
    started = await startSetup(setup, language, root.path, { roslynArgs })
    record.solution = started.launched?.solution
    record.solutionInsideRoot = record.solution ? ownPath(root.path, record.solution) : undefined
    const ready = await waitReady(started.client, language, { timeoutMs: 240000, log })
    record.readyMs = ready.ms
    if (language === 'yaml') {
      const pushed = started.client.pushLog ?? []
      const uris = [...new Set(pushed.map((push) => push.uri))]
      record.pushedUris = uris
      record.outside = uris.filter((uri) => !ownUri(root.path, uri))
      if (typeof started.client.diagnostics === 'function') record.via = (await started.client.diagnostics(DIAGNOSTIC_CASES.yaml.file)).via
      record.correct = ready.ms !== null && record.outside.length === 0
      return record
    }
    const probe = READY[language]
    const references = await started.client.references(probe.file, probe.needle)
    const uris = references.map((reference) => reference.uri)
    record.referenceCount = uris.length
    record.outside = [...new Set(uris.filter((uri) => !ownUri(root.path, uri)))]
    record.correct = locationKeys(references) === [...probe.expected].sort().join(',')
    record.logLines = logLines(started.client, /solution|slnx|sln\b/i)
  } catch (error) {
    record.error = String(error.message ?? error).slice(0, 500)
  } finally {
    await stopQuietly(started)
  }
  return record
}

async function controlOne({ root }) {
  const record = { root: root.name, server: 'csharp-ls started with no --solution', solutionsUnderRoot: countSolutions(root.path) }
  if (!globalDotnetTool('csharp-ls')) return { ...record, skipped: 'the global csharp-ls is not installed' }
  let client
  try {
    const launched = launchServer('csharp-ls-bare', root.path, { source: 'global' })
    client = new EmulatedClient({ spec: launched.spec, root: root.path })
    await client.start()
    const probe = READY.csharp
    const startedAt = now()
    let references = []
    let attempts = 0
    while (now() - startedAt < 150000) {
      attempts++
      try {
        references = await client.references(probe.file, probe.needle)
        if (locationKeys(references) === [...probe.expected].sort().join(',')) break
      } catch (error) {
        record.lastError = String(error.message ?? error).slice(0, 300)
      }
      await new Promise((done) => setTimeout(done, 1000))
    }
    const uris = references.map((reference) => reference.uri)
    record.attempts = attempts
    record.referenceCount = uris.length
    record.correct = locationKeys(references) === [...probe.expected].sort().join(',')
    record.outside = [...new Set(uris.filter((uri) => !ownUri(root.path, uri)))]
    record.logLines = logLines({ client: client.client }, /solution|slnx|sln\b/i)
    record.waitedMs = round(now() - startedAt)
  } catch (error) {
    record.error = String(error.message ?? error).slice(0, 500)
  } finally {
    if (client) await client.stop().catch(() => client.client.child?.kill())
  }
  return record
}

export async function worktreesPart({ base, work }) {
  const roots = createWorktrees(base, work)
  const named = Object.entries(roots).map(([name, path]) => ({ name, path }))
  const out = { layout: { A: 'the generated app', B: 'A/.claude/worktrees/B', C: 'a sibling folder of A' }, setups: {}, control: [] }
  try {
    for (const setup of Object.keys(SETUPS)) {
      out.setups[setup] = {}
      const roslynArgs = setup === 'lspjson' ? chosenRoslynArgs() : undefined
      for (const language of LANGUAGES) {
        out.setups[setup][language] = []
        for (const root of named) {
          log(`worktrees ${setup} ${language} ${root.name}`)
          const args = roslynArgs?.map((arg) => (arg === '@solution' ? pickSolution(root.path) : arg))
          out.setups[setup][language].push(await isolationOne({ setup, language, root, roslynArgs: args }))
        }
      }
    }
    for (const root of named.filter((r) => r.name !== 'C')) {
      log(`worktrees control csharp-ls without --solution at ${root.name}`)
      out.control.push(await controlOne({ root }))
    }
  } finally {
    removeWorktrees(base, roots)
  }
  return out
}

