import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseOptions } from '../cli.mjs'
import { reportFindings } from '../findings.mjs'
import { isRegularFile, trackedFiles } from '../git-files.mjs'
import { run } from '../process.mjs'

export const MAX_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const DATE = /\d{4}-\d{2}-\d{2}/

const lineOf = (text, index) => text.slice(0, index).split('\n').length

export function dayNumber(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return time / DAY_MS
}

export function expiryProblem(isoDate, today) {
  const day = dayNumber(isoDate)
  if (day === null) return `${isoDate} is not a calendar date`
  const now = dayNumber(today)
  if (day < now) return `${isoDate} is already past`
  if (day - now > MAX_DAYS) return `${isoDate} is more than ${MAX_DAYS} days away`
  return null
}

function readString(text, start) {
  let value = ''
  if (text[start] === '@') {
    for (let i = start + 2; i < text.length; i++) {
      if (text[i] === '"' && text[i + 1] === '"') {
        value += '"'
        i++
      } else if (text[i] === '"') return { value, end: i + 1 }
      else value += text[i]
    }
    return { value, end: text.length }
  }
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') {
      value += text[i + 1] ?? ''
      i++
    } else if (text[i] === '"') return { value, end: i + 1 }
    else value += text[i]
  }
  return { value, end: text.length }
}

function argumentsOf(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || (c === '@' && text[i + 1] === '"')) i = readString(text, i).end - 1
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return text.slice(open + 1, i)
  }
  return text.slice(open + 1)
}

function justificationOf(args) {
  const match = /\bJustification\s*=/.exec(args)
  if (!match) return null
  let value = ''
  for (let i = match.index + match[0].length; i < args.length; i++) {
    const c = args[i]
    if (c === '"' || (c === '@' && args[i + 1] === '"')) {
      const string = readString(args, i)
      value += string.value
      i = string.end - 1
    } else if (c === ',') break
  }
  return value
}

export function csharpSuppressions(text) {
  const findings = []
  for (const match of text.matchAll(/\bSuppressMessage(?:Attribute)?\s*\(/g)) {
    const open = match.index + match[0].length - 1
    const justification = justificationOf(argumentsOf(text, open))
    const date = justification === null ? null : /\bUntil (\d{4}-\d{2}-\d{2})\.\s*$/.exec(justification.trim())?.[1] ?? null
    findings.push({ line: lineOf(text, match.index), justification, date })
  }
  return findings
}

function tomlEntries(text) {
  const entries = []
  const headers = [...text.matchAll(/^[ \t]*\[\[(IgnoredVulns|PackageOverrides)\]\][ \t]*(?:#.*)?$/gm)]
  headers.forEach((header, index) => {
    const body = text.slice(header.index + header[0].length, headers[index + 1]?.index ?? text.length)
    const block = body.split(/^\s*\[/m)[0]
    if (header[1] === 'PackageOverrides' && !/^\s*ignore\s*=\s*true\b/m.test(block)) return
    const until = /^\s*ignoreUntil\s*=\s*(.*)$/m.exec(block)
    entries.push({ line: lineOf(text, header.index), value: until ? until[1] : null })
  })
  return entries
}

function expiredAt(block) {
  const key = 'expired_at:'
  for (const row of block.split('\n')) {
    const text = row.trimStart()
    const field = text[0] === '-' && text[1]?.trim() === '' ? text.slice(1).trimStart() : text
    if (field.startsWith(key)) return field.slice(key.length).trim()
  }
  return null
}

function trivyEntries(text) {
  const entries = []
  const rows = text.split('\n')
  for (let i = 0; i < rows.length; i++) {
    const start = /^(\s*)-\s+id:/.exec(rows[i])
    if (!start) {
      if (/^\s*-(?:\s|$)/.test(rows[i]) || /^\s*[\w-]+:\s*\[\s*[^\]\s]/.test(rows[i])) entries.push({ line: i + 1, value: null, unrecognised: true })
      continue
    }
    const indent = start[1].length
    let block = rows[i]
    let j = i + 1
    while (j < rows.length && (!rows[j].trim() || rows[j].length - rows[j].trimStart().length > indent)) block += `\n${rows[j++]}`
    entries.push({ line: i + 1, value: expiredAt(block) })
    i = j - 1
  }
  return entries
}

function datedEntryFindings(file, entries, key, today) {
  const findings = []
  for (const { line, value, unrecognised } of entries) {
    if (unrecognised) {
      findings.push({ file, line, message: `${key}: the list item is not in the supported '- id:' block form (CLA-0071)` })
      continue
    }
    const date = value === null ? null : DATE.exec(value)?.[0] ?? null
    if (date === null) {
      findings.push({ file, line, message: `${key} is missing or has no yyyy-MM-dd date (CLA-0071)` })
      continue
    }
    const problem = expiryProblem(date, today)
    if (problem) findings.push({ file, line, message: `${key}: ${problem} (CLA-0071)` })
  }
  return findings
}

export function findSuppressionProblems(file, text, today) {
  const name = basename(file)
  if (file.endsWith('.cs')) {
    return csharpSuppressions(text).flatMap(({ line, justification, date }) => {
      if (justification === null) return [{ file, line, message: 'SuppressMessage has no Justification (CLA-0071)' }]
      if (date === null) return [{ file, line, message: "SuppressMessage Justification does not end 'Until yyyy-MM-dd.' (CLA-0071)" }]
      const problem = expiryProblem(date, today)
      return problem ? [{ file, line, message: `SuppressMessage: ${problem} (CLA-0071)` }] : []
    })
  }
  if (name === 'osv-scanner.toml') return datedEntryFindings(file, tomlEntries(text), 'ignoreUntil', today)
  if (name === '.trivyignore.yaml') return datedEntryFindings(file, trivyEntries(text), 'expired_at', today)
  return []
}

export async function checkSuppressions({ appRoot, argv, env = process.env, runner = run, regular = (file) => isRegularFile(appRoot, file), now = () => new Date(), read = (file) => readFileSync(join(appRoot, file), 'utf8'), log = console.log, error = console.error }) {
  parseOptions({}, argv)
  const today = now().toISOString().slice(0, 10)
  const findings = []
  for (const file of await trackedFiles(runner, appRoot)) {
    const name = basename(file)
    if (!file.endsWith('.cs') && name !== 'osv-scanner.toml' && name !== '.trivyignore.yaml') continue
    if (!regular(file)) continue
    findings.push(...findSuppressionProblems(file, read(file).replace(/\r\n/g, '\n'), today))
  }
  return reportFindings(findings, { heading: 'Suppressions without a valid expiry (CLA-0071):', env, log, error })
}
