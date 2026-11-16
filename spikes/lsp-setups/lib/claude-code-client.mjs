import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { LspClient } from '../../lsp-host/lib/rpc.mjs'
import { keyOf, uriOf } from '../../lsp-host/lib/edits.mjs'
import { locate } from '../../lsp-host/lib/session.mjs'
import { locationsOf } from '../../lsp-host/lib/protocol.mjs'
import { languageIdOf, now, sleep } from './common.mjs'
import { pushesFor, trackPushes } from './push-log.mjs'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/claude-code-client.json', import.meta.url), 'utf8'))

export const claudeCodeVersion = fixture.claudeCode

export function emulatedCapabilities({ settings } = {}) {
  const capabilities = structuredClone(fixture.capabilities)
  if (!settings) delete capabilities.workspace.configuration
  return capabilities
}

export function emulatedInitializeParams(root, { settings, initializationOptions } = {}) {
  const uri = uriOf(root)
  return {
    processId: process.pid,
    clientInfo: { name: 'claude-code-emulation', version: claudeCodeVersion },
    locale: 'en',
    rootPath: root,
    rootUri: uri,
    workspaceFolders: [{ uri, name: basename(root) }],
    capabilities: emulatedCapabilities({ settings }),
    ...(initializationOptions ? { initializationOptions } : {}),
    trace: 'off',
  }
}

export function settingFor(settings, section) {
  if (!settings) return null
  if (!section) return settings
  return section.split('.').reduce((value, part) => value?.[part], settings) ?? null
}

export class EmulatedClient {
  constructor({ spec, root, settings, initializationOptions }) {
    this.root = root
    this.settings = settings
    this.initializationOptions = initializationOptions
    this.versions = new Map()
    this.client = new LspClient({
      ...spec,
      requestHandlers: {
        'workspace/configuration': (params) => params.items.map((item) => settingFor(settings, item.section)),
        'workspace/workspaceFolders': () => [{ uri: uriOf(root), name: basename(root) }],
      },
    })
  }

  get pid() {
    return this.client.pid
  }

  get pushes() {
    return this.pushLog
  }

  async start({ timeoutMs = 180000 } = {}) {
    this.client.start()
    this.pushLog = trackPushes(this.client)
    this.spawnedAt = now()
    this.initialize = await this.client.request('initialize', emulatedInitializeParams(this.root, this), { timeoutMs })
    this.client.notify('initialized', {})
    if (this.settings) this.client.notify('workspace/didChangeConfiguration', { settings: this.settings })
    return this
  }

  uri(relative) {
    return uriOf(join(this.root, relative))
  }

  text(relative) {
    return readFileSync(join(this.root, relative), 'utf8')
  }

  open(relative) {
    const uri = this.uri(relative)
    const key = keyOf(uri)
    if (this.versions.has(key)) return uri
    this.versions.set(key, 1)
    this.client.notify('textDocument/didOpen', { textDocument: { uri, languageId: languageIdOf(relative), version: 1, text: this.text(relative) } })
    return uri
  }

  change(relative) {
    const uri = this.uri(relative)
    const key = keyOf(uri)
    if (!this.versions.has(key)) return this.open(relative)
    const version = this.versions.get(key) + 1
    this.versions.set(key, version)
    this.client.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text: this.text(relative) }] })
    return uri
  }

  save(relative) {
    this.client.notify('textDocument/didSave', { textDocument: { uri: this.uri(relative) } })
  }

  mark() {
    return this.pushLog.length
  }

  pushesSince(relative, since = 0) {
    return pushesFor(this.pushLog, this.uri(relative), since)
  }

  async waitPush(relative, since, predicate, timeoutMs, sentAt = now()) {
    const deadline = now() + timeoutMs
    for (;;) {
      const seen = this.pushesSince(relative, since)
      const hit = seen.find((push) => predicate(push.diagnostics))
      if (hit) return { found: true, ms: hit.at - sentAt, seen }
      if (now() >= deadline || this.client.exited) return { found: false, ms: null, seen }
      await sleep(20)
    }
  }

  async references(relative, needle, options) {
    this.open(relative)
    const params = { textDocument: { uri: this.uri(relative) }, position: locate(this.text(relative), needle, options), context: { includeDeclaration: true } }
    return locationsOf(await this.client.request('textDocument/references', params))
  }

  async stop() {
    await this.client.shutdown()
  }
}
