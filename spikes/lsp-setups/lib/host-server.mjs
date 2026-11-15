import { readFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative } from 'node:path'
import { LspClient } from '../../lsp-host/lib/rpc.mjs'
import { initializeParams, locationsOf } from '../../lsp-host/lib/protocol.mjs'
import { locate } from '../../lsp-host/lib/session.mjs'
import { keyOf, uriOf } from '../../lsp-host/lib/edits.mjs'
import { languageIdOf, now, sleep } from './common.mjs'
import { settingFor } from './claude-code-client.mjs'
import { YAML_SETTINGS, hostLaunch } from './launch.mjs'
import { pushesFor, trackPushes } from './push-log.mjs'

export const SEVERITY = ['', 'error', 'warning', 'info', 'hint']

export function normalizeDiagnostic(diagnostic) {
  const code = diagnostic.code && typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code
  return {
    line: diagnostic.range.start.line + 1,
    character: diagnostic.range.start.character + 1,
    severity: SEVERITY[diagnostic.severity ?? 1] ?? 'error',
    code: code === undefined ? '' : String(code),
    source: diagnostic.source ?? '',
    message: String(diagnostic.message ?? '').replace(/\s+/g, ' ').trim(),
  }
}

export class HostServer {
  static async start(language, root, { launcher = hostLaunch, log = () => {}, settings } = {}) {
    const server = new HostServer(language, root, { launcher, log, settings })
    await server.start()
    return server
  }

  constructor(language, root, { launcher, log, settings }) {
    this.language = language
    this.root = root
    this.launcher = launcher
    this.log = log
    this.settings = settings ?? (language === 'yaml' ? YAML_SETTINGS : undefined)
    this.versions = new Map()
    this.texts = new Map()
    this.lastPull = new Map()
    this.lastSync = new Map()
  }

  get pid() {
    return this.client.pid
  }

  async start() {
    const launch = await this.launcher(this.language, this.root, { log: this.log })
    this.launch = launch
    this.client = new LspClient({
      ...launch.spec,
      requestHandlers: {
        'workspace/configuration': (params) => params.items.map((item) => settingFor(this.settings, item.section)),
        'workspace/workspaceFolders': () => [{ uri: uriOf(this.root), name: basename(this.root) }],
      },
    })
    this.client.start()
    this.pushLog = trackPushes(this.client)
    this.spawnedAt = now()
    this.initialize = await this.client.request('initialize', initializeParams(this.root, { pullDiagnostics: true }), { timeoutMs: 180000 })
    this.client.notify('initialized', {})
    if (this.settings) this.client.notify('workspace/didChangeConfiguration', { settings: this.settings })
    await launch.afterInitialize(this.client)
    this.pull = Boolean(this.initialize.capabilities?.diagnosticProvider)
    return this
  }

  async waitLoaded() {
    await this.launch.waitLoaded(this.client)
    this.loadedAt = now()
  }

  uri(file) {
    return uriOf(isAbsolute(file) ? file : join(this.root, file))
  }

  relativePath(file) {
    return isAbsolute(file) ? relative(this.root, file) : file
  }

  sync(file, text) {
    const uri = this.uri(file)
    const key = keyOf(uri)
    const content = text ?? readFileSync(isAbsolute(file) ? file : join(this.root, file), 'utf8')
    const previous = this.texts.get(key)
    if (previous === content) return { action: 'unchanged', uri, pushMark: this.pushLog.length }
    this.texts.set(key, content)
    const pushMark = this.pushLog.length
    if (previous === undefined) {
      this.versions.set(key, 1)
      this.client.notify('textDocument/didOpen', { textDocument: { uri, languageId: languageIdOf(file), version: 1, text: content } })
      return { action: 'opened', uri, pushMark }
    }
    const version = this.versions.get(key) + 1
    this.versions.set(key, version)
    this.client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text: content }] })
    return { action: 'changed', uri, pushMark }
  }

  async pullDiagnostics(uri) {
    const key = keyOf(uri)
    const result = await this.client.request('textDocument/diagnostic', { textDocument: { uri } }, { timeoutMs: 60000 })
    if (result?.kind === 'unchanged') return this.lastPull.get(key) ?? []
    const items = result?.items ?? []
    this.lastPull.set(key, items)
    return items
  }

  async pushed(uri, since, { waitMs }) {
    const deadline = now() + waitMs
    for (;;) {
      const seen = pushesFor(this.pushLog, uri, since)
      if (seen.length) return seen[seen.length - 1].diagnostics
      if (now() >= deadline || this.client.exited) break
      await sleep(20)
    }
    return pushesFor(this.pushLog, uri).slice(-1)[0]?.diagnostics ?? []
  }

  async diagnostics(file, { text, pushWaitMs = 3000 } = {}) {
    const synced = this.sync(file, text)
    if (this.pull) return { diagnostics: await this.pullDiagnostics(synced.uri), via: 'pull', action: synced.action }
    const since = synced.action === 'unchanged' ? Math.max(0, this.pushLog.length - 1) : synced.pushMark
    return { diagnostics: await this.pushed(synced.uri, since, { waitMs: synced.action === 'unchanged' ? 0 : pushWaitMs }), via: 'push', action: synced.action }
  }

  open(file) {
    return this.sync(file).uri
  }

  async references(file, needle, options) {
    const uri = this.open(file)
    const text = this.texts.get(keyOf(uri))
    const params = { textDocument: { uri }, position: locate(text, needle, options), context: { includeDeclaration: true } }
    return locationsOf(await this.client.request('textDocument/references', params))
  }

  async stop() {
    await this.client.shutdown().catch(() => this.client.child?.kill())
  }
}
