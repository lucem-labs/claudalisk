import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { applyWorkspaceEdit, changedPaths, hasEffect, keyOf, planWorkspaceEdit, executeActions, pathOf, uriOf, EditRefused } from './edits.mjs'
import { startServer, SERVERS } from './servers.mjs'
import { flattenSymbols, locationsOf } from './protocol.mjs'

export function locate(text, needle, { occurrence = 0, within = 0 } = {}) {
  let index = -1
  for (let i = 0; i <= occurrence; i++) {
    index = text.indexOf(needle, index + 1)
    if (index < 0) throw new Error(`"${needle}" occurrence ${occurrence} not found`)
  }
  const target = index + within
  const before = text.slice(0, target)
  const line = before.split(/\r\n|\n|\r/).length - 1
  const character = target - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) - 1
  return { line, character }
}

export class Session {
  static async start(name, root, options = {}) {
    const session = new Session(root)
    const requestHandlers = {
      ...(SERVERS[name].requestHandlers ?? {}),
      ...(options.requestHandlers ?? {}),
      'workspace/applyEdit': (params) => session.serverApplyEdit(params),
      'workspace/workspaceFolders': () => [{ uri: uriOf(root), name: 'workspace' }],
    }
    const started = await startServer(name, root, { ...options, requestHandlers, onClient: (client) => (session.client = client) })
    session.attach(started)
    return session
  }

  constructor(root) {
    this.root = root
    this.versions = new Map()
    this.serverEdits = []
  }

  attach(started) {
    this.started = started
    this.client = started.client
    this.name = started.name
    this.definition = started.definition
    this.capabilities = started.initialize.capabilities
    return this
  }

  versionOf(uri) {
    return this.versions.get(keyOf(uri))
  }

  isOpen(uri) {
    return this.versions.has(keyOf(uri))
  }

  get languageId() {
    return this.definition.languageId
  }

  path(relative) {
    return join(this.root, relative)
  }

  uri(relative) {
    return uriOf(this.path(relative))
  }

  text(relative) {
    return readFileSync(this.path(relative), 'utf8')
  }

  open(relative) {
    const uri = this.uri(relative)
    if (this.isOpen(uri)) return uri
    this.versions.set(keyOf(uri), 1)
    this.client.notify('textDocument/didOpen', { textDocument: { uri, languageId: this.languageId, version: 1, text: this.text(relative) } })
    return uri
  }

  close(relative) {
    const uri = this.uri(relative)
    if (!this.versions.delete(keyOf(uri))) return
    this.client.notify('textDocument/didClose', { textDocument: { uri } })
  }

  async waitLoaded() {
    await this.definition.waitUntilLoaded(this.client, this.started.prepared)
  }

  position(relative, needle, options) {
    return locate(this.text(relative), needle, options)
  }

  at(relative, needle, options) {
    return { textDocument: { uri: this.uri(relative) }, position: this.position(relative, needle, options) }
  }

  async references(relative, needle, options) {
    this.open(relative)
    const result = await this.client.request('textDocument/references', { ...this.at(relative, needle, options), context: { includeDeclaration: true } })
    return locationsOf(result)
  }

  async referencesWith(relative, needle, extra = {}) {
    this.open(relative)
    return this.client.request('textDocument/references', { ...this.at(relative, needle), context: { includeDeclaration: true }, ...extra })
  }

  async prepareRename(relative, needle, options) {
    this.open(relative)
    return this.client.request('textDocument/prepareRename', this.at(relative, needle, options))
  }

  async rename(relative, needle, newName, options) {
    this.open(relative)
    return this.client.request('textDocument/rename', { ...this.at(relative, needle, options), newName })
  }

  async documentSymbols(relative) {
    this.open(relative)
    const result = await this.client.request('textDocument/documentSymbol', { textDocument: { uri: this.uri(relative) } })
    return flattenSymbols(result)
  }

  openDocuments() {
    return new Map(this.versions)
  }

  apply(edit) {
    const actions = planWorkspaceEdit(edit, { root: this.root, openDocuments: this.openDocuments() })
    executeActions(actions)
    this.sync(actions)
    return actions
  }

  sync(actions) {
    const paths = changedPaths(actions)
    const changes = []
    for (const path of paths) {
      const uri = uriOf(path)
      const exists = existsSync(path)
      const key = keyOf(uri)
      changes.push({ uri, type: exists ? (this.versions.has(key) ? 2 : 1) : 3 })
      if (this.versions.has(key)) {
        if (exists) {
          const version = this.versions.get(key) + 1
          this.versions.set(key, version)
          this.client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text: readFileSync(path, 'utf8') }] })
        } else {
          this.versions.delete(key)
          this.client.notify('textDocument/didClose', { textDocument: { uri } })
        }
      }
    }
    this.client.notify('workspace/didChangeWatchedFiles', { changes })
  }

  resync(relative) {
    const uri = this.uri(relative)
    const key = keyOf(uri)
    const version = (this.versions.get(key) ?? 0) + 1
    this.versions.set(key, version)
    const text = this.text(relative)
    if (version === 1) this.client.notify('textDocument/didOpen', { textDocument: { uri, languageId: this.languageId, version, text } })
    else this.client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] })
    this.client.notify('workspace/didChangeWatchedFiles', { changes: [{ uri, type: 2 }] })
  }

  serverApplyEdit(params) {
    const record = { params, applied: false, effective: false }
    this.serverEdits.push(record)
    try {
      const actions = this.apply(params.edit)
      record.applied = true
      record.effective = hasEffect(actions)
      return { applied: true }
    } catch (error) {
      if (error instanceof EditRefused) {
        record.failureReason = error.message
        return { applied: false, failureReason: error.message }
      }
      throw error
    }
  }

  async stop() {
    await this.client.shutdown()
  }
}

export { applyWorkspaceEdit, pathOf }
