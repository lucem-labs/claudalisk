import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { applyWorkspaceEdit, changedPaths, planWorkspaceEdit, executeActions, pathOf, uriOf, EditRefused } from './edits.mjs'
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
    const requestHandlers = { ...(SERVERS[name].requestHandlers ?? {}), ...(options.requestHandlers ?? {}) }
    const started = await startServer(name, root, { ...options, requestHandlers })
    const session = new Session(started, root)
    requestHandlers['workspace/applyEdit'] = (params) => session.serverApplyEdit(params)
    requestHandlers['workspace/workspaceFolders'] = () => [{ uri: uriOf(root), name: 'workspace' }]
    return session
  }

  constructor(started, root) {
    this.started = started
    this.client = started.client
    this.name = started.name
    this.definition = started.definition
    this.capabilities = started.initialize.capabilities
    this.root = root
    this.versions = new Map()
    this.serverEdits = []
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
    if (this.versions.has(uri)) return uri
    this.versions.set(uri, 1)
    this.client.notify('textDocument/didOpen', { textDocument: { uri, languageId: this.languageId, version: 1, text: this.text(relative) } })
    return uri
  }

  close(relative) {
    const uri = this.uri(relative)
    if (!this.versions.delete(uri)) return
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
      changes.push({ uri, type: exists ? (this.versions.has(uri) ? 2 : 1) : 3 })
      if (this.versions.has(uri)) {
        if (exists) {
          const version = this.versions.get(uri) + 1
          this.versions.set(uri, version)
          this.client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text: readFileSync(path, 'utf8') }] })
        } else {
          this.versions.delete(uri)
          this.client.notify('textDocument/didClose', { textDocument: { uri } })
        }
      }
    }
    this.client.notify('workspace/didChangeWatchedFiles', { changes })
  }

  resync(relative) {
    const uri = this.uri(relative)
    const version = (this.versions.get(uri) ?? 0) + 1
    this.versions.set(uri, version)
    const text = this.text(relative)
    if (version === 1) this.client.notify('textDocument/didOpen', { textDocument: { uri, languageId: this.languageId, version, text } })
    else this.client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] })
    this.client.notify('workspace/didChangeWatchedFiles', { changes: [{ uri, type: 2 }] })
  }

  serverApplyEdit(params) {
    this.serverEdits.push(params)
    try {
      this.apply(params.edit)
      return { applied: true }
    } catch (error) {
      if (error instanceof EditRefused) return { applied: false, failureReason: error.message }
      throw error
    }
  }

  async stop() {
    await this.client.shutdown()
  }
}

export { applyWorkspaceEdit, pathOf }
