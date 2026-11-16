import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keyOf } from '../../lsp-host/lib/edits.mjs'

export const spikeDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
export const OS = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform] ?? process.platform
export const MAX_WAIT_MS = 300000
export const boundedMs = (value, fallback) => {
  const ms = Number(value)
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_WAIT_MS) : fallback
}
export const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
export const log = (line) => process.stderr.write(`${line}\n`)
export const now = () => performance.now()
export const round = (value, digits = 0) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null)

export const LANGUAGE_OF_EXTENSION = {
  '.cs': 'csharp',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.yml': 'yaml',
  '.yaml': 'yaml',
}

export const LANGUAGE_ID_OF_EXTENSION = {
  '.cs': 'csharp',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.yml': 'yaml',
  '.yaml': 'yaml',
}

export const extensionOf = (file) => {
  const match = /\.[A-Za-z0-9]+$/.exec(file)
  return match ? match[0].toLowerCase() : ''
}

export const languageOf = (file) => LANGUAGE_OF_EXTENSION[extensionOf(file)]
export const languageIdOf = (file) => LANGUAGE_ID_OF_EXTENSION[extensionOf(file)] ?? 'plaintext'

export function insideRoot(root, path) {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function uriInsideRoot(root, uri) {
  if (!uri.startsWith('file:')) return false
  const rootKey = keyOf(pathToFileURL(resolve(root)).href)
  const key = keyOf(uri)
  return key === rootKey || key.startsWith(rootKey + sep)
}

export function normalizeRoot(root, platform = process.platform) {
  let resolved = resolve(root)
  try {
    resolved = realpathSync.native(resolved)
  } catch {}
  const slashed = resolved.replaceAll('\\', '/').replace(/\/+$/, '')
  return platform === 'win32' ? slashed.toLowerCase() : slashed
}

export const sameKey = (a, b) => keyOf(a) === keyOf(b)

export function summarizeValues(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return { runs: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null }
  const pick = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
  return { runs: sorted.length, medianMs: round(pick(0.5), 1), p95Ms: round(pick(0.95), 1), minMs: round(sorted[0], 1), maxMs: round(sorted[sorted.length - 1], 1) }
}
