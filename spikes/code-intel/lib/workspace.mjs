import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Session } from '../../lsp-host/lib/session.mjs'
import { pathOf, uriOf } from '../../lsp-host/lib/edits.mjs'
import { flattenSymbols, locationsOf } from '../../lsp-host/lib/protocol.mjs'
import { chainOfSymbolPath, stripSignature } from './names.mjs'
import { CodeIntelError } from './errors.mjs'
import { untilStable } from './stable.mjs'
import { countEdits } from './merge.mjs'

export const LANGUAGES = {
  csharp: { server: 'roslyn', extensions: ['.cs'] },
  typescript: { server: 'typescript', extensions: ['.ts', '.tsx'] },
}

const SKIPPED = new Set(['node_modules', 'bin', 'obj', 'dist', 'build', 'out', 'coverage'])
const TYPESCRIPT_SECTIONS = ['typescript', 'javascript', 'js/ts']
const TYPESCRIPT_HANDLERS = {
  'workspace/configuration': (params) => params.items.map((item) => (TYPESCRIPT_SECTIONS.includes(item.section) ? { preferences: { useAliasesForRenames: false } } : null)),
}
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export const rootFromEnvironment = (env = process.env, cwd = process.cwd()) => resolve(env.CLAUDE_PROJECT_DIR || cwd)

export function languageOfFile(file) {
  const extension = extname(file).toLowerCase()
  const found = Object.entries(LANGUAGES).find(([, definition]) => definition.extensions.includes(extension))
  if (!found) throw new CodeIntelError(`no language server for ${extension || 'a file without an extension'}; supported: ${Object.values(LANGUAGES).flatMap((l) => l.extensions).join(' ')}`)
  return found[0]
}

export class Workspace {
  constructor({ root = rootFromEnvironment(), start, referenceAttempts = 12, referenceDelayMs = 250 } = {}) {
    this.root = resolve(root)
    this.start = start ?? ((server, projectRoot) => Session.start(server, projectRoot, { requestHandlers: server === 'typescript' ? TYPESCRIPT_HANDLERS : {} }))
    this.referenceAttempts = referenceAttempts
    this.referenceDelayMs = referenceDelayMs
    this.sessions = new Map()
    this.sent = new Map()
    this.anchors = new Map()
  }

  relative(uri) {
    if (!uri.startsWith('file:')) return uri
    const path = relative(this.root, pathOf(uri))
    return path.startsWith('..') || isAbsolute(path) ? pathOf(uri).split(sep).join('/') : path.split(sep).join('/')
  }

  resolveFile(file) {
    const path = resolve(this.root, String(file))
    const rel = relative(this.root, path)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new CodeIntelError(`${file} is outside the project root`)
    return rel.split(sep).join('/')
  }

  session(language) {
    if (!this.sessions.has(language)) {
      const server = LANGUAGES[language].server
      const starting = this.launch(server, language).catch((error) => {
        this.sessions.delete(language)
        throw error
      })
      this.sessions.set(language, starting)
    }
    return this.sessions.get(language)
  }

  async launch(server, language) {
    const logs = join(tmpdir(), `claudalisk-ci-logs-${createHash('sha1').update(this.root).digest('hex').slice(0, 12)}`)
    process.env.LSP_HOST_LOG_DIR ??= logs
    const session = await this.start(server, this.root)
    await session.waitLoaded()
    if (language === 'typescript') await this.anchor(session, language)
    return session
  }

  firstSource(language, accept = () => true) {
    const extensions = LANGUAGES[language].extensions
    const walk = (dir) => {
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      } catch {
        return undefined
      }
      for (const entry of entries) {
        if (entry.isFile() && extensions.includes(extname(entry.name).toLowerCase()) && !entry.name.endsWith('.d.ts') && accept(join(dir, entry.name))) return join(dir, entry.name)
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED.has(entry.name)) {
          const found = walk(join(dir, entry.name))
          if (found) return found
        }
      }
      return undefined
    }
    return walk(this.root)
  }

  async anchor(session, language) {
    if (this.anchors.has(language)) return
    const inSource = (file) => relative(this.root, file).split(sep).includes('src')
    const found = this.firstSource(language, inSource) ?? this.firstSource(language)
    if (!found) throw new CodeIntelError(`no ${language} source file under the project root`)
    this.anchors.set(language, true)
    this.sync(session, relative(this.root, found).split(sep).join('/'))
  }

  sync(session, rel) {
    const key = `${session.name}:${rel}`
    const text = readFileSync(join(this.root, rel), 'utf8')
    const uri = session.uri(rel)
    if (!session.isOpen(uri)) {
      session.open(rel)
    } else if (this.sent.get(key) !== text) {
      session.resync(rel)
    }
    this.sent.set(key, text)
    return uri
  }

  async touch(file) {
    const rel = this.resolveFile(file)
    const session = await this.session(languageOfFile(rel))
    const uri = this.sync(session, rel)
    return { session, rel, uri }
  }

  locationOf(location) {
    return { path: this.relative(location.uri), line: location.range.start.line + 1, character: location.range.start.character + 1 }
  }

  params(uri, line, character) {
    if (!Number.isInteger(line) || !Number.isInteger(character) || line < 1 || character < 1) throw new CodeIntelError('line and character are 1-based integers')
    return { textDocument: { uri }, position: { line: line - 1, character: character - 1 } }
  }

  async locations(method, file, line, character) {
    const { session, uri } = await this.touch(file)
    const result = await session.client.request(method, this.params(uri, line, character))
    return locationsOf(result).filter((l) => l.uri).map((l) => this.locationOf(l))
  }

  definition(file, line, character) {
    return this.locations('textDocument/definition', file, line, character)
  }

  implementations(file, line, character) {
    return this.locations('textDocument/implementation', file, line, character)
  }

  async references(file, line, character) {
    const { session, uri } = await this.touch(file)
    const params = { ...this.params(uri, line, character), context: { includeDeclaration: true } }
    const { value, stable, attempts } = await untilStable(async () => locationsOf(await session.client.request('textDocument/references', params)).filter((l) => l.uri), { attempts: this.referenceAttempts, delayMs: this.referenceDelayMs })
    return { locations: value.map((l) => this.locationOf(l)), stable, attempts }
  }

  async calls(direction, file, line, character) {
    const { session, uri } = await this.touch(file)
    const items = (await session.client.request('textDocument/prepareCallHierarchy', this.params(uri, line, character))) ?? []
    const found = []
    for (const item of items) {
      const method = direction === 'in' ? 'callHierarchy/incomingCalls' : 'callHierarchy/outgoingCalls'
      for (const call of (await session.client.request(method, { item })) ?? []) {
        const target = direction === 'in' ? call.from : call.to
        found.push({ name: target.name, path: this.relative(target.uri), line: target.selectionRange.start.line + 1 })
      }
    }
    return found
  }

  callers(file, line, character) {
    return this.calls('in', file, line, character)
  }

  callees(file, line, character) {
    return this.calls('out', file, line, character)
  }

  async applyEdit(session, edit) {
    const actions = session.apply(edit)
    for (const action of actions) {
      if (action.type === 'write') this.sent.set(`${session.name}:${this.relative(uriOf(action.path))}`, action.content)
    }
    const files = [...new Set(actions.filter((a) => a.type === 'write' && a.changed).map((a) => this.relative(uriOf(a.path))))].sort()
    return { files, edits: countEdits(edit) }
  }

  async prepareRename(file, line, character) {
    const { session, uri } = await this.touch(file)
    const params = this.params(uri, line, character)
    const prepared = await session.client.request('textDocument/prepareRename', params)
    if (!prepared) throw new CodeIntelError(`${file}:${line}:${character} is not a symbol that can be renamed`)
    return { session, params }
  }

  async renameEdit(file, line, character, newName) {
    if (!IDENTIFIER.test(String(newName))) throw new CodeIntelError(`"${newName}" is not a valid identifier`)
    const { session, params } = await this.prepareRename(file, line, character)
    const edit = await session.client.request('textDocument/rename', { ...params, newName })
    if (!edit) throw new CodeIntelError('the server returned no edit for the rename')
    return { session, edit }
  }

  async rename(file, line, character, newName) {
    const { session, edit } = await this.renameEdit(file, line, character, newName)
    return this.applyEdit(session, edit)
  }

  async diagnosticsOf(session, rel, uri) {
    if (session.capabilities.diagnosticProvider) {
      const report = await session.client.request('textDocument/diagnostic', { textDocument: { uri } })
      return report?.items ?? []
    }
    const deadline = Date.now() + 3000
    while (!session.client.diagnostics.has(uri) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
    return session.client.diagnostics.get(uri)?.diagnostics ?? []
  }

  async diagnostics(file) {
    const { session, rel, uri } = await this.touch(file)
    const items = await this.diagnosticsOf(session, rel, uri)
    return items.filter((d) => (d.severity ?? 1) <= 2).map((d) => ({ path: rel, line: d.range.start.line + 1, severity: d.severity ?? 1, message: d.message, range: d.range }))
  }

  async documentSymbols(file) {
    const { session, uri } = await this.touch(file)
    const result = await session.client.request('textDocument/documentSymbol', { textDocument: { uri } })
    if (result?.length && result[0].location) {
      return result.map((s) => ({ name: stripSignature(s.name), kind: s.kind, line: s.location.range.start.line + 1, depth: 0, chain: [stripSignature(s.name)], range: s.location.range, selectionRange: s.location.range }))
    }
    return flattenSymbols(result).map((s) => ({
      name: stripSignature(s.name),
      kind: s.kind,
      line: s.selectionRange.start.line + 1,
      depth: s.path.length - 1,
      chain: chainOfSymbolPath(s.path),
      range: s.range,
      selectionRange: s.selectionRange,
    }))
  }

  async workspaceSymbols(language, query) {
    const session = await this.session(language)
    const result = (await session.client.request('workspace/symbol', { query })) ?? []
    return result
      .filter((s) => s.location?.uri?.startsWith('file:') && s.location.range)
      .map((s) => ({ name: s.name, kind: s.kind, container: s.containerName, path: this.relative(s.location.uri), range: s.location.range }))
  }

  async replaceRange(file, range, newText) {
    const { session, uri } = await this.touch(file)
    return this.applyEdit(session, { documentChanges: [{ textDocument: { uri, version: null }, edits: [{ range, newText }] }] })
  }

  readFile(file) {
    return readFileSync(join(this.root, this.resolveFile(file)), 'utf8')
  }

  async stop() {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    for (const pending of sessions) {
      const session = await pending.catch(() => undefined)
      if (session) await session.stop().catch(() => session.client.child?.kill())
    }
  }
}
