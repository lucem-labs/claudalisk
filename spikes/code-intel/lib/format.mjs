export const KINDS = {
  1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class', 6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum', 11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator', 26: 'TypeParameter',
}

export const kindName = (kind) => KINDS[kind] ?? `Kind${kind}`

export const MAX_CANDIDATES = 10
export const MAX_LINES = 40

const byPathThenLine = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)

export function groupByFile(locations) {
  const files = new Map()
  for (const location of [...locations].sort(byPathThenLine)) {
    const lines = files.get(location.path) ?? []
    if (!lines.includes(location.line)) lines.push(location.line)
    files.set(location.path, lines)
  }
  return files
}

export function locationsText(locations) {
  if (!locations.length) return 'none'
  return [...groupByFile(locations)].map(([path, lines]) => `${path}:${lines.join(',')}`).join('\n')
}

export function referencesText(locations, { stable = true } = {}) {
  if (!locations.length) return 'no references'
  const files = groupByFile(locations)
  const head = `${locations.length} references in ${files.size} files${stable ? '' : ' (count was still changing)'}`
  return [head, ...[...files].map(([path, lines]) => `${path} (${lines.length}): ${lines.join(',')}`)].join('\n')
}

export function callsText(calls) {
  if (!calls.length) return 'none'
  const lines = [...calls].sort(byPathThenLine).map((call) => `${call.name} ${call.path}:${call.line}`)
  return [...new Set(lines)].slice(0, MAX_LINES).join('\n')
}

export function candidatesText(candidates, { limit = MAX_CANDIDATES } = {}) {
  const shown = candidates.slice(0, limit).map((c) => `${c.qualified} (${kindName(c.kind)}) ${c.path}:${c.line}`)
  if (candidates.length > limit) shown.push(`... and ${candidates.length - limit} more`)
  return shown.join('\n')
}

export function ambiguousText(name, candidates) {
  return `ambiguous: ${candidates.length} symbols match "${name}"; use a longer name path\n${candidatesText(candidates)}`
}

const SEVERITIES = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' }

export function diagnosticsText(diagnostics, { limit = 20 } = {}) {
  if (!diagnostics.length) return 'no diagnostics'
  const lines = diagnostics.slice(0, limit).map((d) => `${d.path}:${d.line} ${SEVERITIES[d.severity] ?? 'info'} ${d.message.split(/\r?\n/)[0].slice(0, 160)}`)
  if (diagnostics.length > limit) lines.push(`... and ${diagnostics.length - limit} more`)
  return lines.join('\n')
}

export function symbolsText(symbols) {
  if (!symbols.length) return 'no symbols'
  return symbols.slice(0, 200).map((s) => `${'  '.repeat(s.depth)}${s.name} ${kindName(s.kind)} :${s.line}`).join('\n')
}

export function truncate(text, cap) {
  if (text.length <= cap) return text
  return `${text.slice(0, cap)}\n... truncated, ${text.length - cap} more characters`
}
