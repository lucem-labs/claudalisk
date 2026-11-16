import { callsText, diagnosticsText, locationsText, referencesText, symbolsText } from '../lib/format.mjs'
import { integer, string } from '../lib/tool.mjs'

const at = [string('file', 'path relative to the project root'), integer('line', '1-based line'), integer('character', '1-based column')]

const defined = [
  { name: 'definition', description: 'Where the symbol at file:line:character is declared.', params: at, run: async (ws, i) => locationsText(await ws.definition(i.file, i.line, i.character)) },
  {
    name: 'references',
    description: 'All references to the symbol at file:line:character, grouped by file.',
    params: at,
    run: async (ws, i) => {
      const { locations, stable } = await ws.references(i.file, i.line, i.character)
      return referencesText(locations, { stable })
    },
  },
  { name: 'implementations', description: 'Implementations of the interface or abstract member at file:line:character.', params: at, run: async (ws, i) => locationsText(await ws.implementations(i.file, i.line, i.character)) },
  { name: 'callers', description: 'Callers of the function or method at file:line:character.', params: at, run: async (ws, i) => callsText(await ws.callers(i.file, i.line, i.character)) },
  { name: 'callees', description: 'Functions and methods called by the one at file:line:character.', params: at, run: async (ws, i) => callsText(await ws.callees(i.file, i.line, i.character)) },
  {
    name: 'rename',
    description: 'Rename the symbol at file:line:character everywhere and write the files.',
    params: [...at, string('newName', 'the new identifier')],
    run: async (ws, i) => {
      const { files, edits } = await ws.rename(i.file, i.line, i.character, i.newName)
      return `renamed to ${i.newName}: ${edits} edits in ${files.length} files\n${files.join('\n')}`
    },
  },
  { name: 'diagnostics', description: 'Errors and warnings of a file.', params: [string('file', 'path relative to the project root')], run: async (ws, i) => diagnosticsText(await ws.diagnostics(i.file)) },
  { name: 'symbols', description: 'Outline of a file: declared symbols with lines.', params: [string('file', 'path relative to the project root')], run: async (ws, i) => symbolsText(await ws.documentSymbols(i.file)) },
]

const EDITS = new Set(['rename'])

export const tools = defined.map((tool) => ({ ...tool, annotations: { readOnlyHint: !EDITS.has(tool.name) } }))
