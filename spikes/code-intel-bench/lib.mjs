import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quoteForWindowsShell } from '../../tools/registry.mjs'

export const benchRoot = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = resolve(benchRoot, '..', '..')
export const fixtureFile = join(benchRoot, 'fixture.json')
export const ledgerFile = join(benchRoot, 'results', 'ledger.json')
export const TASK_IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function commandLine(command, args, platform = process.platform) {
  const script = /\.(?:mjs|js|cjs)$/.test(command)
  const file = script ? process.execPath : command
  const list = script ? [command, ...args] : args
  if (platform === 'win32' && !script) return [[file, ...list].map(quoteForWindowsShell).join(' '), [], { shell: true }]
  return [file, list, {}]
}

export function runCaptured(command, args, { cwd, env, input, timeoutMs } = {}) {
  return new Promise((done) => {
    const [file, list, extra] = commandLine(command, args)
    const child = spawn(file, list, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...extra })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill() }, timeoutMs) : undefined
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); done({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut }) })
    child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? -1, stdout, stderr, timedOut }) })
    child.stdin.on('error', () => {})
    child.stdin.end(input ?? '')
  })
}

export async function git(args, cwd, env) {
  const result = await runCaptured('git', args, { cwd, env })
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}
