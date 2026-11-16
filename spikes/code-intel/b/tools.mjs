import { CodeIntelError } from '../lib/errors.mjs'
import { ambiguousText, callsText, candidatesText, diagnosticsText, locationsText, referencesText } from '../lib/format.mjs'
import { mergeEdits } from '../lib/merge.mjs'
import { positionOf, replaceBodyText } from '../lib/body.mjs'
import { characterOf, isOverloadGroup, lineOf, notFound, resolveName, resolveOne } from '../lib/symbols.mjs'
import { string } from '../lib/tool.mjs'

const name = string('name', 'name path: Namespace.Type.Member (C#) or folder/or/file:exportedName (TypeScript)')

const BODY_KINDS = new Set([6, 9, 12])
const INDENT = { csharp: '    ', typescript: '  ' }

export async function find(ws, query) {
  const { parsed, candidates } = await resolveName(ws, query)
  if (!candidates.length) throw notFound(query, parsed)
  return `${candidates.length} matches\n${candidatesText(candidates, { limit: 20 })}`
}

export async function renameByName(ws, query, newName) {
  const { parsed, candidates } = await resolveName(ws, query)
  if (!candidates.length) throw notFound(query, parsed)
  if (candidates.length > 1 && !isOverloadGroup(candidates)) throw new CodeIntelError(ambiguousText(query, candidates))
  const edits = []
  let session
  for (const candidate of candidates) {
    const planned = await ws.renameEdit(candidate.path, lineOf(candidate), characterOf(candidate), newName)
    session = planned.session
    edits.push(planned.edit)
  }
  const merged = candidates.length === 1 ? edits[0] : mergeEdits(edits)
  if (!merged) throw new CodeIntelError('the server answered the rename in a form that cannot be merged across overloads')
  const { files, edits: count } = await ws.applyEdit(session, merged)
  const overloads = candidates.length > 1 ? `, ${candidates.length} overloads` : ''
  return `renamed ${candidates[0].qualified} to ${newName}${overloads}: ${count} edits in ${files.length} files\n${files.join('\n')}`
}

export async function replaceBody(ws, query, body) {
  const { candidate } = await resolveOne(ws, query)
  if (!BODY_KINDS.has(candidate.kind) && ![13, 14].includes(candidate.kind)) throw new CodeIntelError(`${candidate.qualified} is not a method or function`)
  const text = ws.readFile(candidate.path)
  const language = candidate.path.endsWith('.cs') ? 'csharp' : 'typescript'
  const plan = replaceBodyText(text, candidate.range, body, { unit: INDENT[language], typeAnnotations: language === 'typescript' })
  const range = { start: positionOf(text, plan.replaceStart), end: positionOf(text, plan.replaceEnd) }
  await ws.replaceRange(candidate.path, range, plan.replacement)
  const diagnostics = await ws.diagnostics(candidate.path)
  const errors = diagnostics.filter((d) => d.severity === 1)
  const head = `replaced the ${plan.kind} body of ${candidate.qualified} (${candidate.path}:${candidate.line}); ${errors.length} errors in the file`
  return errors.length ? `${head}\n${diagnosticsText(errors, { limit: 10 })}` : head
}

export async function diagnosticsByName(ws, query) {
  const { candidate } = await resolveOne(ws, query)
  const all = await ws.diagnostics(candidate.path)
  const within = all.filter((d) => d.range.start.line >= candidate.range.start.line && d.range.start.line <= candidate.range.end.line)
  const head = `${candidate.qualified} (${candidate.path}:${candidate.line}): ${within.length} in the symbol, ${all.length} in the file`
  return within.length ? `${head}\n${diagnosticsText(within, { limit: 20 })}` : head
}

const position = (ws, query, action) =>
  resolveOne(ws, query).then(({ candidate }) => action(candidate.path, lineOf(candidate), characterOf(candidate), candidate))

const defined = [
  { name: 'find', description: 'Find symbols by name path; lists kind and path:line.', params: [name], run: (ws, i) => find(ws, i.name) },
  { name: 'definition', description: 'Where the named symbol is declared.', params: [name], run: (ws, i) => position(ws, i.name, async (path, line, character) => locationsText(await ws.definition(path, line, character))) },
  { name: 'implementations', description: 'Implementations of the named interface or abstract member.', params: [name], run: (ws, i) => position(ws, i.name, async (path, line, character) => locationsText(await ws.implementations(path, line, character))) },
  { name: 'callers', description: 'Callers of the named function or method.', params: [name], run: (ws, i) => position(ws, i.name, async (path, line, character) => callsText(await ws.callers(path, line, character))) },
  { name: 'callees', description: 'What the named function or method calls.', params: [name], run: (ws, i) => position(ws, i.name, async (path, line, character) => callsText(await ws.callees(path, line, character))) },
  {
    name: 'references',
    description: 'All references to the named symbol, grouped by file with counts.',
    params: [name],
    run: (ws, i) =>
      position(ws, i.name, async (path, line, character) => {
        const { locations, stable } = await ws.references(path, line, character)
        return referencesText(locations, { stable })
      }),
  },
  { name: 'rename', description: 'Rename the named symbol (all overloads) everywhere and write the files.', params: [name, string('newName', 'the new identifier')], run: (ws, i) => renameByName(ws, i.name, i.newName) },
  { name: 'replaceBody', description: 'Replace the body of the named method or function without reading its file.', params: [name, string('body', 'the new body statements, without the outer braces; for an expression body, the expression')], run: (ws, i) => replaceBody(ws, i.name, i.body) },
  { name: 'diagnostics', description: 'Errors and warnings in the named symbol, plus a count for its file.', params: [name], run: (ws, i) => diagnosticsByName(ws, i.name) },
]

const EDITS = new Set(['rename', 'replaceBody'])

export const tools = defined.map((tool) => ({ ...tool, annotations: { readOnlyHint: !EDITS.has(tool.name) } }))
