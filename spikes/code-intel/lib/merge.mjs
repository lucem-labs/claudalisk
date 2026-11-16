import { operationsOf } from '../../lsp-host/lib/edits.mjs'

const same = (a, b) => a.line === b.line && a.character === b.character

export function mergeEdits(edits) {
  const byUri = new Map()
  for (const edit of edits) {
    for (const operation of operationsOf(edit)) {
      if (!operation.textDocument) return undefined
      const list = byUri.get(operation.textDocument.uri) ?? []
      for (const item of operation.edits) {
        const duplicate = list.some((e) => same(e.range.start, item.range.start) && same(e.range.end, item.range.end) && e.newText === item.newText)
        if (!duplicate) list.push({ range: item.range, newText: item.newText })
      }
      byUri.set(operation.textDocument.uri, list)
    }
  }
  return { documentChanges: [...byUri].map(([uri, list]) => ({ textDocument: { uri, version: null }, edits: list })) }
}

export function countEdits(edit) {
  return operationsOf(edit).reduce((sum, operation) => sum + (operation.edits?.length ?? 0), 0)
}
