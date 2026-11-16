import { OS } from './common.mjs'
import { SETUPS } from './setups.mjs'
import { DEFAULT_DEADLINE_MS } from '../post-edit-hook.mjs'

export const PARTS = ['attempts', 'correctness', 'worktrees', 'memory', 'hook']

export function errorsIn(value, path = '') {
  if (!value || typeof value !== 'object') return []
  const found = []
  for (const [key, child] of Object.entries(value)) {
    if (key === 'error' && typeof child === 'string') found.push(`${path || 'result'}: ${child}`)
    else found.push(...errorsIn(child, `${path}${path ? '.' : ''}${key}`))
  }
  return found
}

export function mergeParts({ parts, install, versionInfo, date = new Date().toISOString() }) {
  const setups = {}
  for (const [name, definition] of Object.entries(SETUPS)) {
    setups[name] = {
      description: definition.description,
      servers: definition.serverOf,
      manualSteps: definition.manualSteps,
      installSteps: install.filter((step) => step.setup === name),
    }
  }
  return {
    os: OS,
    platform: process.platform,
    arch: process.arch,
    date,
    versions: versionInfo,
    hookDefaultDeadlineMs: DEFAULT_DEADLINE_MS,
    setups,
    ...Object.fromEntries(PARTS.map((part) => [part, parts[part] ?? null])),
  }
}

