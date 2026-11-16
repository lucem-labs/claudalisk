import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { benchRoot, runCaptured } from './lib.mjs'

export const tasksRoot = join(benchRoot, 'tasks')
const CHECK_TIMEOUT_MS = 20 * 60 * 1000
const TAIL = 1500

const idNumber = (id) => {
  const number = Number.parseInt(id.slice(1), 10)
  return Number.isNaN(number) ? Infinity : number
}

const compareIds = (left, right) => {
  const a = idNumber(left)
  const b = idNumber(right)
  if (a !== b) return a < b ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}

export function taskIds(root = tasksRoot) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'task.json')))
    .map((entry) => entry.name)
    .sort(compareIds)
}

export function loadTask(id, root = tasksRoot) {
  const folder = join(root, id)
  if (!existsSync(join(folder, 'task.json'))) throw new Error(`There is no task ${id} in ${root}`)
  const task = JSON.parse(readFileSync(join(folder, 'task.json'), 'utf8'))
  const preamble = existsSync(join(root, 'preamble.md')) ? readFileSync(join(root, 'preamble.md'), 'utf8').trim() : ''
  return { ...task, folder, prompt: [preamble, task.prompt].filter(Boolean).join('\n\n') }
}

export function parseTaskList(text, root = tasksRoot) {
  const known = taskIds(root)
  if (!text) return known
  const wanted = text.split(',').map((part) => part.trim()).filter(Boolean)
  const unknown = wanted.filter((id) => !known.includes(id))
  if (unknown.length) throw new Error(`Unknown tasks: ${unknown.join(', ')}. Known: ${known.join(', ')}`)
  return known.filter((id) => wanted.includes(id))
}

export function installHidden(task, destination) {
  const hidden = join(task.folder, 'hidden')
  if (existsSync(hidden)) cpSync(hidden, destination, { recursive: true, force: true })
}

export async function runChecks(task, directory, run = runCaptured, extra = {}) {
  const results = []
  for (const check of task.checks) {
    const [command, ...args] = check.command
    const outcome = await run(command, args, { cwd: join(directory, check.cwd ?? '.'), timeoutMs: CHECK_TIMEOUT_MS, ...extra })
    const passed = outcome.code === 0
    results.push({
      name: check.name,
      passed,
      exitCode: outcome.code,
      ...(passed ? {} : { tail: `${outcome.stdout}${outcome.stderr}`.slice(-TAIL) }),
    })
  }
  return results
}

export const accepted = (checks) => checks.length > 0 && checks.every((check) => check.passed)
