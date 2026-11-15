import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chooseSolution } from './solution.mjs'
import { LspClient } from './rpc.mjs'
import { initializeParams } from './protocol.mjs'
import { uriOf } from './edits.mjs'

export const spikeDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const tool = (name, args) => ({ command: 'dotnet', args: ['tool', 'run', name, '--', ...args], cwd: spikeDirectory })

export function restoreSolution(root, solution, log = () => {}) {
  const restore = spawnSync('dotnet', ['restore', solution, '--verbosity', 'quiet'], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (restore.error || restore.status !== 0) {
    log(`dotnet restore did not finish cleanly (${restore.error?.message ?? `exit ${restore.status}`})`)
    return false
  }
  return true
}

function pickSolution(root, log) {
  const { solution, others } = chooseSolution(root, process.env.LSP_HOST_SOLUTION)
  if (!solution) throw new Error(`no .sln or .slnx within ${root}`)
  log(`loading ${relative(root, solution)}${others.length ? `; also found ${others.join(', ')}` : ''}`)
  restoreSolution(root, solution, log)
  return solution
}

export const SERVERS = {
  'csharp-ls': {
    language: 'csharp',
    languageId: 'csharp',
    extensions: ['.cs'],
    requestHandlers: { 'workspace/configuration': (params) => params.items.map(() => ({})) },
    prepare(root, log) {
      const solution = pickSolution(root, log)
      return { solution, spec: tool('csharp-ls', ['--solution', solution]) }
    },
    async afterInitialize() {},
    async waitUntilLoaded() {},
  },
  roslyn: {
    language: 'csharp',
    languageId: 'csharp',
    extensions: ['.cs'],
    prepare(root, log) {
      const solution = pickSolution(root, log)
      const logs = join(root, '..', 'roslyn-logs')
      mkdirSync(logs, { recursive: true })
      return { solution, spec: tool('roslyn-language-server', ['--stdio', '--telemetryLevel', 'off', '--logLevel', 'Information', '--extensionLogDirectory', logs]) }
    },
    async afterInitialize(client, prepared) {
      client.notify('solution/open', { solution: uriOf(prepared.solution) })
    },
    async waitUntilLoaded(client) {
      await client.waitForNotification('workspace/projectInitializationComplete', () => true, 300000)
    },
  },
  typescript: {
    language: 'typescript',
    languageId: 'typescript',
    extensions: ['.ts', '.tsx'],
    prepare() {
      return { spec: { command: process.execPath, args: [join(spikeDirectory, 'node_modules', 'typescript', 'bin', 'tsc'), '--lsp', '--stdio'], cwd: spikeDirectory } }
    },
    async afterInitialize() {},
    async waitUntilLoaded() {},
  },
}

export async function startServer(name, root, { log = () => {}, requestHandlers = {} } = {}) {
  const definition = SERVERS[name]
  const prepared = definition.prepare(root, log)
  const spawnedAt = Date.now()
  const client = new LspClient({ ...prepared.spec, requestHandlers })
  client.start()
  const initialize = await client.request('initialize', initializeParams(root), { timeoutMs: 180000 })
  client.notify('initialized', {})
  await definition.afterInitialize(client, prepared)
  return { name, definition, client, prepared, initialize, spawnedAt, root }
}
