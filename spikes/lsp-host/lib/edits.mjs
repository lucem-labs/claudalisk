import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const BOM = String.fromCharCode(0xfeff)

export class EditRefused extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const refuse = (code, message) => {
  throw new EditRefused(code, message)
}

export function pathOf(uri) {
  if (!uri.startsWith('file:')) refuse('not-a-file', `${uri} is not a file URI`)
  return resolve(fileURLToPath(uri))
}

export const uriOf = (path) => pathToFileURL(path).href

export function keyOf(uri, platform = process.platform) {
  if (!uri.startsWith('file:')) return uri
  const path = pathOf(uri)
  return platform === 'win32' || platform === 'darwin' ? path.toLowerCase() : path
}

function inside(root, path) {
  const rel = relative(resolve(root), path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function guard(root, uri) {
  const path = pathOf(uri)
  if (!inside(root, path)) refuse('outside-root', `${uri} is outside the workspace root`)
  return path
}

export function splitText(text) {
  const bom = text.startsWith(BOM)
  const body = bom ? text.slice(1) : text
  const eol = /\r\n|\n|\r/.exec(body)?.[0] ?? '\n'
  return { bom, body, eol }
}

function lineStarts(body) {
  const starts = [0]
  const pattern = /\r\n|\n|\r/g
  let match
  while ((match = pattern.exec(body))) starts.push(match.index + match[0].length)
  return starts
}

function offsetOf(body, starts, position) {
  if (position.line < 0 || position.line >= starts.length) refuse('bad-position', `line ${position.line} is outside the document`)
  const start = starts[position.line]
  const last = position.line + 1 === starts.length
  const next = last ? body.length : starts[position.line + 1]
  const end = last ? next : next - /(\r\n|\n|\r)$/.exec(body.slice(start, next))[0].length
  return start + Math.min(position.character, end - start)
}

export function applyTextEdits(text, edits) {
  const { bom, body, eol } = splitText(text)
  const starts = lineStarts(body)
  const resolved = edits.map((edit, index) => {
    const start = offsetOf(body, starts, edit.range.start)
    const end = offsetOf(body, starts, edit.range.end)
    if (end < start) refuse('bad-range', `range ends before it starts at ${edit.range.start.line}:${edit.range.start.character}`)
    return { start, end, index, newText: edit.newText.replace(/\r\n|\n|\r/g, eol) }
  })
  const ordered = [...resolved].sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start < ordered[i - 1].end) refuse('overlap', `edits ${ordered[i - 1].index} and ${ordered[i].index} overlap`)
  }
  let result = body
  for (const edit of [...resolved].sort((a, b) => b.start - a.start || b.end - a.end || b.index - a.index)) {
    result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end)
  }
  return (bom ? BOM : '') + result
}

export function operationsOf(edit) {
  if (edit.documentChanges) return edit.documentChanges
  return Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({ textDocument: { uri, version: null }, edits }))
}

class Virtual {
  constructor() {
    this.files = new Map()
  }

  read(path) {
    if (this.files.has(path)) return this.files.get(path)
    return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null
  }

  exists(path) {
    if (this.files.has(path)) return this.files.get(path) !== null
    return existsSync(path)
  }
}

export function planWorkspaceEdit(edit, { root, openDocuments = new Map() }) {
  const virtual = new Virtual()
  const actions = []
  for (const operation of operationsOf(edit)) {
    if (operation.kind === 'create') {
      const path = guard(root, operation.uri)
      if (virtual.exists(path)) {
        if (operation.options?.ignoreIfExists) continue
        if (!operation.options?.overwrite) refuse('exists', `${operation.uri} already exists`)
      }
      virtual.files.set(path, '')
      actions.push({ type: 'write', path, content: '', changed: true })
    } else if (operation.kind === 'rename') {
      const from = guard(root, operation.oldUri)
      const to = guard(root, operation.newUri)
      if (!virtual.exists(from)) refuse('missing', `${operation.oldUri} does not exist`)
      if (virtual.exists(to) && !operation.options?.overwrite) {
        if (operation.options?.ignoreIfExists) continue
        refuse('exists', `${operation.newUri} already exists`)
      }
      if (existsSync(from) && statSync(from).isDirectory() && !virtual.files.has(from)) refuse('directory-rename', 'renaming a folder is not planned')
      const content = virtual.read(from)
      virtual.files.set(to, content)
      virtual.files.set(from, null)
      actions.push({ type: 'rename', from, to })
    } else if (operation.kind === 'delete') {
      const path = guard(root, operation.uri)
      if (!virtual.exists(path)) {
        if (operation.options?.ignoreIfNotExists) continue
        refuse('missing', `${operation.uri} does not exist`)
      }
      if (existsSync(path) && statSync(path).isDirectory() && !operation.options?.recursive) refuse('directory-delete', `${operation.uri} is a folder; recursive is not set`)
      virtual.files.set(path, null)
      actions.push({ type: 'delete', path })
    } else if (operation.textDocument) {
      const { uri, version } = operation.textDocument
      const path = guard(root, uri)
      if (version !== null && version !== undefined) {
        const key = keyOf(uri)
        if (!openDocuments.has(key)) refuse('version', `${uri} is not open, so version ${version} cannot be checked`)
        if (openDocuments.get(key) !== version) refuse('version', `${uri} is at version ${openDocuments.get(key)}, the edit is for ${version}`)
      }
      const text = virtual.read(path)
      if (text === null) refuse('missing', `${uri} does not exist`)
      const next = applyTextEdits(text, operation.edits.map((e) => ({ range: e.range, newText: e.newText })))
      virtual.files.set(path, next)
      actions.push({ type: 'write', path, content: next, changed: next !== text })
    } else {
      refuse('unknown-operation', `unknown workspace edit operation ${JSON.stringify(operation).slice(0, 80)}`)
    }
  }
  return actions
}

export function executeActions(actions) {
  for (const action of actions) {
    if (action.type === 'write') {
      mkdirSync(dirname(action.path), { recursive: true })
      writeFileSync(action.path, action.content, 'utf8')
    } else if (action.type === 'rename') {
      mkdirSync(dirname(action.to), { recursive: true })
      renameSync(action.from, action.to)
    } else {
      rmSync(action.path, { recursive: true, force: true })
    }
  }
}

export function applyWorkspaceEdit(edit, options) {
  const actions = planWorkspaceEdit(edit, options)
  executeActions(actions)
  return actions
}

export const hasEffect = (actions) => actions.some((action) => action.type !== 'write' || action.changed)

export function changedPaths(actions) {
  const paths = new Set()
  for (const action of actions) {
    if (action.type === 'rename') {
      paths.add(action.from)
      paths.add(action.to)
    } else paths.add(action.path)
  }
  return [...paths]
}
