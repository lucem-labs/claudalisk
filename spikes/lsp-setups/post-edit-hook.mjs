import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { endpointFor, isAbsent, request } from './lib/daemon-protocol.mjs'
import { languageOf, sleep } from './lib/common.mjs'

export const DEFAULT_DEADLINE_MS = 1000
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
const REPORTED = new Set(['error', 'warning'])
const MAX_LINES = 20

const here = dirname(fileURLToPath(import.meta.url))
const daemonScript = join(here, 'host-daemon.mjs')

export function findRoot(file, fallback) {
  let directory = dirname(file)
  for (;;) {
    if (existsSync(join(directory, '.git'))) return directory
    const parent = dirname(directory)
    if (parent === directory) return fallback
    directory = parent
  }
}

export function formatDiagnostics(root, file, diagnostics) {
  const path = relative(root, file).replaceAll('\\', '/')
  return diagnostics
    .filter((diagnostic) => REPORTED.has(diagnostic.severity))
    .slice(0, MAX_LINES)
    .map((d) => `${path}:${d.line}:${d.character} ${d.severity} ${d.code ? `${d.code} ` : ''}${d.message}`)
    .join('\n')
}

export function outputFor(text) {
  if (!text) return ''
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } })}\n`
}

export function inputOf(raw, cwdFallback = process.cwd()) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!EDIT_TOOLS.has(input.tool_name)) return undefined
  const given = input.tool_input?.file_path
  if (typeof given !== 'string' || !given) return undefined
  const cwd = input.cwd ?? cwdFallback
  const file = isAbsolute(given) ? resolve(given) : resolve(cwd, given)
  if (!languageOf(file)) return undefined
  return { file, root: findRoot(file, cwd) }
}

export function startDaemon(root, { script = daemonScript, env = process.env } = {}) {
  const child = spawn(process.execPath, [script, '--root', root], { detached: true, stdio: 'ignore', windowsHide: true, env })
  child.unref()
}

export async function diagnosticsText({ file, root }, { deadlineMs, start = startDaemon, ask = request }) {
  const endpoint = endpointFor(root)
  const until = Date.now() + deadlineMs
  let started = false
  while (Date.now() < until) {
    const remaining = until - Date.now()
    try {
      const answer = await ask(endpoint, { id: 1, method: 'diagnostics', file, deadlineMs: Math.max(0, remaining - 150) }, { timeoutMs: remaining })
      if (!answer.ok || answer.pending || answer.skipped) return ''
      return formatDiagnostics(root, file, answer.diagnostics ?? [])
    } catch (error) {
      if (!isAbsent(error)) return ''
      if (!started) {
        started = true
        start(root)
      }
      await sleep(40)
    }
  }
  return ''
}

export async function main({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  const deadlineMs = Number(env.CLAUDALISK_LSP_HOOK_DEADLINE_MS) || DEFAULT_DEADLINE_MS
  const chunks = []
  for await (const chunk of stdin) chunks.push(chunk)
  const target = inputOf(Buffer.concat(chunks).toString('utf8'))
  if (!target) return
  const backstop = setTimeout(() => process.exit(0), deadlineMs + 200)
  try {
    const text = await diagnosticsText(target, { deadlineMs })
    const output = outputFor(text)
    if (output) await new Promise((done) => stdout.write(output, done))
  } catch {}
  clearTimeout(backstop)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
  process.exit(0)
}
