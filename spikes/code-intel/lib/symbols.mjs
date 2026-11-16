import { CodeIntelError } from './errors.mjs'
import { ambiguousText } from './format.mjs'
import { matches, parseName, qualified, stripSignature } from './names.mjs'

const MAX_RAW = 60

const contains = (range, position) =>
  (range.start.line < position.line || (range.start.line === position.line && range.start.character <= position.character)) &&
  (range.end.line > position.line || (range.end.line === position.line && range.end.character >= position.character))

const span = (range) => (range.end.line - range.start.line) * 100000 + (range.end.character - range.start.character)

export function chainAt(symbols, position, name) {
  const inside = symbols.filter((s) => s.name === name && contains(s.selectionRange, position))
  inside.sort((a, b) => span(a.selectionRange) - span(b.selectionRange))
  return inside[0]
}

export async function resolveName(workspace, name) {
  const parsed = parseName(name)
  const raw = (await workspace.workspaceSymbols(parsed.language, parsed.query)).filter((s) => stripSignature(s.name) === parsed.query).slice(0, MAX_RAW)
  const documents = new Map()
  const found = new Map()
  for (const symbol of raw) {
    if (!documents.has(symbol.path)) documents.set(symbol.path, await workspace.documentSymbols(symbol.path))
    const declared = chainAt(documents.get(symbol.path), symbol.range.start, parsed.query)
    const candidate = {
      name: parsed.query,
      kind: symbol.kind,
      path: symbol.path,
      line: (declared?.selectionRange ?? symbol.range).start.line + 1,
      chain: declared?.chain ?? [parsed.query],
      selection: (declared?.selectionRange ?? symbol.range).start,
      range: declared?.range ?? symbol.range,
    }
    if (!matches(parsed, candidate)) continue
    candidate.qualified = qualified(parsed, candidate)
    found.set(`${candidate.path}:${candidate.selection.line}:${candidate.selection.character}`, candidate)
  }
  const candidates = [...found.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.selection.line - b.selection.line))
  return { parsed, candidates }
}

export function notFound(name, parsed) {
  const hint = parsed.language === 'typescript' ? ' (write folder/or/file:exportedName)' : ' (write Namespace.Type.Member, any trailing part)'
  return new CodeIntelError(`no symbol matches "${name}"${hint}`)
}

const isConstructorOf = (candidate, others) =>
  candidate.chain.length > 1 &&
  candidate.chain.at(-1) === candidate.chain.at(-2) &&
  others.some((other) => other !== candidate && other.path === candidate.path && other.chain.length === candidate.chain.length - 1 && other.chain.every((part, i) => part === candidate.chain[i]))

export const withoutConstructors = (candidates) => {
  const kept = candidates.filter((candidate) => !isConstructorOf(candidate, candidates))
  return kept.length ? kept : candidates
}

export async function resolveOne(workspace, name) {
  const { parsed, candidates: all } = await resolveName(workspace, name)
  const candidates = withoutConstructors(all)
  if (!candidates.length) throw notFound(name, parsed)
  if (candidates.length > 1) throw new CodeIntelError(ambiguousText(name, candidates))
  return { parsed, candidate: candidates[0] }
}

export const isOverloadGroup = (candidates) => candidates.length > 1 && candidates.every((c) => c.kind === 6 && c.qualified === candidates[0].qualified && c.path === candidates[0].path)

export const lineOf = (candidate) => candidate.selection.line + 1
export const characterOf = (candidate) => candidate.selection.character + 1
