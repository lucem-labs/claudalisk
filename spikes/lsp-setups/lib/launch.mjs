import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { chooseSolution } from '../../lsp-host/lib/solution.mjs'
import { restoreSolution } from '../../lsp-host/lib/servers.mjs'
import { uriOf } from '../../lsp-host/lib/edits.mjs'
import { spawnArguments } from '../../../tools/registry.mjs'
import { spikeDirectory } from './common.mjs'

export const YAML_SETTINGS = { yaml: { validate: true, schemaStore: { enable: true } } }

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name)

export function globalDotnetTool(name) {
  const path = join(homedir(), '.dotnet', 'tools', exe(name))
  return existsSync(path) ? path : undefined
}

let npmRoot
export function globalNpmRoot() {
  if (npmRoot === undefined) {
    const [file, args, options] = spawnArguments('npm', ['root', '-g'], spikeDirectory)
    const result = spawnSync(file, args, { ...options, stdio: 'pipe', encoding: 'utf8', windowsHide: true })
    npmRoot = result.status === 0 ? result.stdout.trim() : ''
  }
  return npmRoot
}

export function globalNodeScript(packageName, relative) {
  const root = globalNpmRoot()
  const path = root ? join(root, packageName, relative) : ''
  return path && existsSync(path) ? path : undefined
}

const pinnedScript = (packageName, relative) => join(spikeDirectory, 'node_modules', packageName, relative)

const SCRIPTS = {
  typescript: { packageName: 'typescript', relative: join('bin', 'tsc'), args: ['--lsp', '--stdio'] },
  yaml: { packageName: 'yaml-language-server', relative: join('bin', 'yaml-language-server'), args: ['--stdio'] },
}

export function nodeServer(kind, { source = 'pinned', root }) {
  const script = SCRIPTS[kind]
  const global = source === 'global' ? globalNodeScript(script.packageName, script.relative) : undefined
  const path = global ?? pinnedScript(script.packageName, script.relative)
  return { spec: { command: process.execPath, args: [path, ...script.args], cwd: root }, source: global ? 'global' : 'pinned' }
}

export function dotnetServer(name, args, { source = 'pinned', root }) {
  const global = source === 'global' ? globalDotnetTool(name) : undefined
  if (global) return { spec: { command: global, args, cwd: root }, source: 'global' }
  return { spec: { command: 'dotnet', args: ['tool', 'run', name, '--', ...args], cwd: spikeDirectory }, source: 'pinned' }
}

export function roslynLogs() {
  const folder = join(tmpdir(), 'lsp-setups-roslyn-logs')
  mkdirSync(folder, { recursive: true })
  return folder
}

export const roslynBaseArgs = () => ['--telemetryLevel', 'off', '--logLevel', 'Information', '--extensionLogDirectory', roslynLogs()]

export function pickSolution(root, log = () => {}) {
  const { solution, others } = chooseSolution(root, process.env.LSP_HOST_SOLUTION)
  if (!solution) throw new Error(`no .sln or .slnx within ${root}`)
  log(`solution ${solution}${others.length ? `; also found ${others.join(', ')}` : ''}`)
  return solution
}

export function launchServer(id, root, { source = 'pinned', roslynArgs, log = () => {} } = {}) {
  if (id === 'csharp-ls') {
    const solution = pickSolution(root, log)
    const restored = restoreSolution(root, solution, log)
    return { ...dotnetServer('csharp-ls', ['--solution', solution], { source, root }), solution, restored }
  }
  if (id === 'csharp-ls-bare') return { ...dotnetServer('csharp-ls', [], { source, root }), solution: undefined }
  if (id === 'roslyn') {
    const solution = pickSolution(root, log)
    const restored = restoreSolution(root, solution, log)
    const args = [...(roslynArgs ?? ['--stdio']), ...roslynBaseArgs()]
    return { ...dotnetServer('roslyn-language-server', args, { source: 'pinned', root }), solution, restored }
  }
  if (id === 'typescript' || id === 'yaml') return nodeServer(id, { source, root })
  throw new Error(`unknown server ${id}`)
}

export function hostLaunch(language, root, { log = () => {} } = {}) {
  if (language === 'csharp') {
    const launched = launchServer('roslyn', root, { log })
    return {
      ...launched,
      id: 'roslyn',
      afterInitialize: async (client) => client.notify('solution/open', { solution: uriOf(launched.solution) }),
      waitLoaded: async (client) => client.waitForNotification('workspace/projectInitializationComplete', () => true, 300000),
    }
  }
  const id = language
  return { ...launchServer(id, root, { log }), id, afterInitialize: async () => {}, waitLoaded: async () => {} }
}

export function roslynHelp() {
  const launched = dotnetServer('roslyn-language-server', ['--help'], { root: spikeDirectory })
  const result = spawnSync(launched.spec.command, launched.spec.args, { cwd: launched.spec.cwd, encoding: 'utf8', windowsHide: true, timeout: 120000 })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

export const KNOWN_LOAD_FLAGS = ['--autoLoadProjects']

export function roslynAttempts(helpText, solutionPath) {
  const attempts = [{ id: 'stdio-only', args: ['--stdio'], description: 'no solution/open, the workspace folder comes from initialize' }]
  const lines = helpText.split(/\r?\n/)
  const seen = new Set(['--stdio', '--help', '--version'])
  for (const line of lines) {
    const flag = /(--[A-Za-z][A-Za-z-]*)/.exec(line)?.[1]
    if (!flag || seen.has(flag) || !/load|solution|project/i.test(flag)) continue
    seen.add(flag)
    const valued = /<[^>]+>/.test(line)
    if (valued && !/solution/i.test(flag)) continue
    attempts.push({
      id: flag.slice(2),
      args: valued ? ['--stdio', flag, solutionPath] : ['--stdio', flag],
      description: `${flag}${valued ? ' with the solution path' : ''}: ${line.trim().slice(0, 160)}`,
    })
  }
  for (const flag of KNOWN_LOAD_FLAGS) {
    if (seen.has(flag)) continue
    attempts.push({ id: flag.slice(2), args: ['--stdio', flag], description: `${flag}: a load flag the server may support, tried although --help does not list it` })
  }
  return attempts
}
