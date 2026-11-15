import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { operationsOf, pathOf } from './edits.mjs'
import { locate } from './session.mjs'
import { sleep, Unsupported } from './runner.mjs'
import { verifyBuild } from './fixture.mjs'

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

const SYMBOL_METHOD = new Set([6, 9, 12])

const PRICING = 'backend/Proof.LspCases/Pricing.cs'
const SHAPES = 'backend/Proof.LspCases/Shapes.cs'
const LEDGER = 'backend/Proof.LspCases/Ledger.Entries.cs'
const CUSTOMER = 'backend/Proof.LspCases/Customer.cs'
const PATTERNS = 'backend/Proof.LspCases/Patterns.cs'
const SAMPLE = 'backend/Proof.LspCases/Sample.cs'
const MISNAMED = 'backend/Proof.LspCases/Misnamed.cs'
const CASE_TESTS = 'backend/Proof.LspCases.Tests/CaseTests.cs'
const PRICE_FORMAT = 'frontend/src/shared/lib/price/format-price.ts'
const PRICE_INDEX = 'frontend/src/shared/lib/price/index.ts'
const PRICE_SUMMARY = 'frontend/src/pages/pricing/ui/pricing-summary.ts'
const PRICE_TEST = 'frontend/src/shared/lib/price/format-price.test.ts'

function summarize(edit, root) {
  const operations = operationsOf(edit ?? {})
  const files = new Set()
  const resources = []
  let edits = 0
  for (const operation of operations) {
    if (operation.kind) resources.push(`${operation.kind}`)
    else {
      const uri = operation.textDocument.uri
      files.add(uri.startsWith('file:') ? relative(root, pathOf(uri)).replaceAll('\\', '/') : uri)
      edits += operation.edits.length
    }
  }
  return { shape: edit?.documentChanges ? 'documentChanges' : edit?.changes ? 'changes' : 'none', files: [...files].sort(), editCount: edits, resourceOperations: resources }
}

async function renameAndApply(ctx, file, needle, newName, options) {
  const { session } = ctx
  let prepared
  try {
    prepared = await session.prepareRename(file, needle, options)
  } catch (error) {
    prepared = { error: error.message }
  }
  must(prepared, 'prepareRename returned nothing at the symbol')
  const edit = await session.rename(file, needle, newName, options)
  must(edit, 'rename returned no edit')
  const summary = summarize(edit, session.root)
  summary.prepare = prepared.error ? `error: ${prepared.error}` : prepared.defaultBehavior ? 'defaultBehavior' : prepared.range ? 'range' : prepared.start ? 'range' : 'ok'
  const actions = session.apply(edit)
  summary.applied = actions.length
  return summary
}

function present(ctx, file, ...snippets) {
  const text = ctx.session.text(file)
  for (const snippet of snippets) must(text.includes(snippet), `${file} does not contain ${JSON.stringify(snippet)} after the edit`)
}

function absent(ctx, file, ...snippets) {
  const text = ctx.session.text(file)
  for (const snippet of snippets) must(!text.includes(snippet), `${file} still contains ${JSON.stringify(snippet)}`)
}

async function replaceText(ctx, file, needle, newText, options) {
  const { session } = ctx
  const start = locate(session.text(file), needle, options)
  const end = locate(session.text(file), needle, { ...options, within: needle.length })
  session.open(file)
  const uri = session.uri(file)
  return session.apply({ documentChanges: [{ textDocument: { uri, version: session.versions.get(uri) }, edits: [{ range: { start, end }, newText }] }] })
}

function symbolNamed(symbols, name, kinds = SYMBOL_METHOD) {
  const found = symbols.filter((s) => (s.name === name || s.name.startsWith(`${name}(`)) && kinds.has(s.kind))
  must(found.length > 0, `documentSymbol has no symbol ${name}: ${symbols.map((s) => s.name).slice(0, 30).join(', ')}`)
  return found[0]
}

function lineStartOf(text, line) {
  return { line, character: 0 }
}

function textAt(text, range) {
  const lines = text.split(/\r\n|\n|\r/)
  if (range.start.line === range.end.line) return lines[range.start.line].slice(range.start.character, range.end.character)
  const out = [lines[range.start.line].slice(range.start.character)]
  for (let l = range.start.line + 1; l < range.end.line; l++) out.push(lines[l])
  out.push(lines[range.end.line].slice(0, range.end.character))
  return out.join('\n')
}

async function bodyReplace(ctx, file, symbolName, newText, expectInFile) {
  const { session } = ctx
  const symbols = await session.documentSymbols(file)
  const symbol = symbolNamed(symbols, symbolName)
  const original = textAt(session.text(file), symbol.range)
  const uri = session.uri(file)
  const actions = session.apply({ documentChanges: [{ textDocument: { uri, version: session.versions.get(uri) }, edits: [{ range: symbol.range, newText }] }] })
  present(ctx, file, expectInFile)
  ctx.verify()
  return { replacedStartsWith: original.slice(0, 40), replacedEndsWith: original.slice(-20), resultKind: Array.isArray(symbols) ? 'hierarchical' : 'flat', actions: actions.length }
}

async function insertAround(ctx, file, symbolName, before, after, expected) {
  const { session } = ctx
  const symbols = await session.documentSymbols(file)
  const symbol = symbolNamed(symbols, symbolName)
  const uri = session.uri(file)
  const text = session.text(file)
  const startLine = lineStartOf(text, symbol.range.start.line)
  session.apply({
    documentChanges: [
      {
        textDocument: { uri, version: session.versions.get(uri) },
        edits: [
          { range: { start: startLine, end: startLine }, newText: before },
          { range: { start: symbol.range.end, end: symbol.range.end }, newText: after },
        ],
      },
    ],
  })
  for (const snippet of expected) present(ctx, file, snippet)
  ctx.verify()
  const after2 = await session.documentSymbols(file)
  return { symbolsAfter: after2.map((s) => s.name).slice(0, 12) }
}

async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) return undefined
    await sleep(300)
  }
}

async function diagnosticsCase(ctx, file, needle, replacement, expectedBuildStage) {
  const { session, language } = ctx
  const uri = session.uri(file)
  session.open(file)
  const baseline = session.client.notifications.length
  await replaceText(ctx, file, needle, replacement)
  const build = verifyBuild(ctx.app, language)
  must(!build.ok, 'the build passed although the edit should break it')
  const pushed = await waitFor(() => {
    const fresh = session.client.notifications.slice(baseline).filter((n) => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri)
    return fresh.map((n) => n.params).findLast((p) => p.diagnostics.some((d) => d.severity === 1))
  }, 20000)
  let pulled
  let pullError
  if (session.capabilities.diagnosticProvider) {
    pulled = await waitFor(async () => {
      try {
        const report = await session.client.request('textDocument/diagnostic', { textDocument: { uri } })
        return report?.items?.some((d) => d.severity === 1) ? report : undefined
      } catch (error) {
        pullError = error.message
        return undefined
      }
    }, 20000)
  }
  const details = {
    buildBroke: build.stage,
    pushed: pushed ? { supported: true, count: pushed.diagnostics.length, first: pushed.diagnostics[0].message.slice(0, 100) } : { supported: false },
    pullAdvertised: Boolean(session.capabilities.diagnosticProvider),
    pulled: pulled ? { supported: true, count: pulled.items.length, first: pulled.items.find((d) => d.severity === 1).message.slice(0, 100) } : { supported: false, error: pullError },
  }
  Object.assign(ctx.details, details)
  must(pushed || pulled, `neither pushed nor pulled diagnostics reported the error (pull advertised: ${details.pullAdvertised}${pullError ? `, last error ${pullError}` : ''})`)
  return details
}

async function hierarchyCase(ctx, file, needle, expectedSubtypes, superFile, superNeedle, expectedSuper) {
  const { session } = ctx
  if (!session.capabilities.typeHierarchyProvider) throw new Unsupported('typeHierarchyProvider is not advertised')
  session.open(file)
  const items = await session.client.request('textDocument/prepareTypeHierarchy', session.at(file, needle))
  must(items?.length, 'prepareTypeHierarchy returned no item')
  const subtypes = await session.client.request('typeHierarchy/subtypes', { item: items[0] })
  const names = (subtypes ?? []).map((i) => i.name).sort()
  session.open(superFile)
  const superItems = await session.client.request('textDocument/prepareTypeHierarchy', session.at(superFile, superNeedle))
  must(superItems?.length, 'prepareTypeHierarchy returned no item for the implementation')
  const supertypes = await session.client.request('typeHierarchy/supertypes', { item: superItems[0] })
  const superNames = (supertypes ?? []).map((i) => i.name).sort()
  Object.assign(ctx.details, { prepared: items[0].name, subtypes: names, supertypes: superNames })
  for (const name of expectedSubtypes) must(names.some((n) => n === name || n.startsWith(`${name}`)), `subtypes ${JSON.stringify(names)} lack ${name}`)
  must(superNames.some((n) => n.includes(expectedSuper)), `supertypes ${JSON.stringify(superNames)} lack ${expectedSuper}`)
  return {}
}

const KIND_PATTERNS = {
  E3: /change signature|add parameter|remove parameter|reorder param|introduce parameter/i,
  E6: /organi[sz]e|sort usings|remove unnecessary|remove unused|fix all|fix-all/i,
  extract: /extract/i,
  inline: /inline/i,
  move: /\bmove\b|rename (file|type)|sync (namespace|file)/i,
}

function describeAction(action) {
  return { title: action.title, kind: action.kind ?? (action.command ? 'command' : ''), edit: Boolean(action.edit), command: Boolean(action.command?.command ?? (typeof action.command === 'string' ? action.command : false)), disabled: action.disabled?.reason }
}

async function codeActionsAt(ctx, file, range, diagnostics = []) {
  const { session } = ctx
  session.open(file)
  const textDocument = { uri: session.uri(file) }
  const kinds = session.capabilities.codeActionProvider?.codeActionKinds ?? ['quickfix', 'refactor', 'source']
  const requests = [undefined, ...kinds]
  const merged = new Map()
  for (const only of requests) {
    let result
    try {
      result = await session.client.request('textDocument/codeAction', { textDocument, range, context: { diagnostics, triggerKind: 1, ...(only ? { only: [only] } : {}) } })
    } catch {
      result = null
    }
    for (const action of result ?? []) {
      const key = `${action.kind ?? ''}|${action.title}`
      if (!merged.has(key)) merged.set(key, action)
    }
  }
  return [...merged.values()]
}

async function pullDiagnostics(ctx, file) {
  const { session } = ctx
  if (!session.capabilities.diagnosticProvider) return []
  const uri = session.uri(file)
  for (let i = 0; i < 40; i++) {
    try {
      const report = await session.client.request('textDocument/diagnostic', { textDocument: { uri } })
      if (report?.items?.length) return report.items
    } catch {
      return []
    }
    await sleep(500)
  }
  return []
}

function rangeOf(session, file, startNeedle, length, options) {
  const text = session.text(file)
  const start = locate(text, startNeedle, options)
  const end = locate(text, startNeedle, { ...options, within: length ?? startNeedle.length })
  return { start, end }
}

function cursor(session, file, needle, options) {
  const p = locate(session.text(file), needle, options)
  return { start: p, end: p }
}

async function applyAction(ctx, action) {
  const { session } = ctx
  let resolved = action
  if (!action.edit && session.capabilities.codeActionProvider?.resolveProvider) {
    resolved = await session.client.request('codeAction/resolve', action)
  }
  if (!resolved.edit && resolved.command?.command === 'roslyn.client.nestedCodeAction') {
    const nested = resolved.command.arguments?.[0]?.NestedCodeActions ?? []
    must(nested.length > 0, 'the nested code action has no children')
    const child = await session.client.request('codeAction/resolve', nested[0])
    must(child.edit, `the nested action "${nested[0].title}" has no edit after resolve`)
    session.apply(child.edit)
    return { via: 'nested', nested: nested.map((n) => n.title).slice(0, 4), ...summarize(child.edit, session.root) }
  }
  if (!resolved.edit) {
    if (resolved.command) {
      const command = typeof resolved.command === 'string' ? { command: resolved.command, arguments: resolved.arguments } : resolved.command
      const before = session.serverEdits.length
      await session.client.request('workspace/executeCommand', { command: command.command, arguments: command.arguments })
      must(session.serverEdits.length > before, `the command ${command.command} sent no workspace/applyEdit`)
      return { via: 'command' }
    }
    throw new Error(`the action "${action.title}" carries neither an edit nor a command`)
  }
  const summary = summarize(resolved.edit, session.root)
  session.apply(resolved.edit)
  return { via: 'edit', ...summary }
}

async function applyMatching(ctx, positions, pattern, { kind } = {}) {
  const offered = []
  for (const { file, range, diagnostics } of positions) {
    const actions = await codeActionsAt(ctx, file, range, diagnostics ?? [])
    offered.push(...actions.map(describeAction))
    const match = actions.find((a) => (pattern.test(a.title) || (kind && a.kind?.startsWith(kind))) && !a.disabled)
    if (match) {
      const applied = await applyAction(ctx, match)
      ctx.verify()
      return { action: match.title, kind: match.kind ?? '', ...applied }
    }
  }
  throw new Unsupported(`no code action matching ${pattern} at the chosen positions; offered: ${offered.map((o) => o.title).slice(0, 12).join(' | ') || 'none'}`)
}

function csharpPositions(session) {
  return {
    signature: { file: PRICING, range: cursor(session, PRICING, 'Total(int quantity') },
    selection: { file: PRICING, range: rangeOf(session, PRICING, 'quantity * unit') },
    block: { file: SAMPLE, range: { start: locate(session.text(SAMPLE), 'if (quantity'), end: locate(session.text(SAMPLE), 'return text;') } },
    statement: { file: SAMPLE, range: rangeOf(session, SAMPLE, 'var text = $"Total {total}";') },
    unusedImport: { file: SAMPLE, range: cursor(session, SAMPLE, 'using System.Text;', { within: 8 }) },
    variable: { file: SAMPLE, range: cursor(session, SAMPLE, 'var total', { within: 5 }) },
    typeDeclaration: { file: CUSTOMER, range: cursor(session, CUSTOMER, 'CasesJsonContext', { within: 3 }) },
  }
}

async function surveyCase(ctx, positions, brokenSetup) {
  const { session } = ctx
  const byPosition = {}
  for (const [name, position] of Object.entries(positions)) {
    const actions = await codeActionsAt(ctx, position.file, position.range)
    byPosition[name] = actions.map(describeAction)
  }
  const errorSites = {}
  for (const setup of brokenSetup) {
    await replaceText(ctx, setup.file, setup.needle, setup.replacement)
    const diagnostics = await pullDiagnostics(ctx, setup.file)
    const range = setup.range(session)
    const here = diagnostics.filter((d) => d.range.start.line === range.start.line)
    const actions = await codeActionsAt(ctx, setup.file, here[0]?.range ?? range, here.length ? here : diagnostics)
    errorSites[setup.name] = { diagnostics: diagnostics.map((d) => d.message.slice(0, 80)).slice(0, 3), actions: actions.map(describeAction) }
    await replaceText(ctx, setup.file, setup.replacement, setup.needle)
  }
  const all = [...Object.values(byPosition).flat(), ...Object.values(errorSites).flatMap((s) => s.actions)]
  const matching = (pattern) => [...new Set(all.filter((a) => pattern.test(a.title) || pattern.test(a.kind)).map((a) => `${a.kind}: ${a.title}`))]
  const features = {
    E3_changeSignature: matching(KIND_PATTERNS.E3),
    E6_organizeFixAll: matching(KIND_PATTERNS.E6),
    E7_extract: matching(KIND_PATTERNS.extract),
    E7_inline: matching(KIND_PATTERNS.inline),
    E7_move: matching(KIND_PATTERNS.move),
  }
  Object.assign(ctx.details, { byPosition, errorSites, features, advertisedKinds: session.capabilities.codeActionProvider?.codeActionKinds ?? null })
  return {}
}

export const csharpCases = [
  {
    id: 'rename.overload',
    language: 'csharp',
    async run(ctx) {
      const summary = await renameAndApply(ctx, PRICING, 'Total(int quantity', 'Sum')
      Object.assign(ctx.details, summary)
      present(ctx, PRICING, 'Sum(int quantity, decimal unit)', 'Pricing.Sum(2, 3.5m)')
      present(ctx, SAMPLE, 'Pricing.Sum(quantity, unit)')
      const text = ctx.session.text(PRICING)
      ctx.details.otherOverloads = text.includes('Total(decimal amount)') && text.includes('Total(IEnumerable<decimal>') ? 'left alone' : text.includes('Sum(decimal amount)') ? 'renamed too' : 'mixed'
      ctx.verify()
    },
  },
  {
    id: 'rename.interface-method',
    language: 'csharp',
    async run(ctx) {
      Object.assign(ctx.details, await renameAndApply(ctx, SHAPES, 'Area();', 'Surface'))
      present(ctx, SHAPES, 'double Surface();', 'public double Surface() => Math.PI', 'public double Surface() => side', 'shape.Surface()')
      present(ctx, CASE_TESTS, 'new Square(2).Surface()')
      ctx.verify()
    },
  },
  {
    id: 'rename.partial-class',
    language: 'csharp',
    async run(ctx) {
      Object.assign(ctx.details, await renameAndApply(ctx, LEDGER, 'Ledger', 'Book'))
      present(ctx, LEDGER, 'partial class Book')
      present(ctx, 'backend/Proof.LspCases/Ledger.Totals.cs', 'partial class Book')
      present(ctx, CASE_TESTS, 'new Book()')
      ctx.verify()
    },
  },
  {
    id: 'rename.record-property',
    language: 'csharp',
    async run(ctx) {
      Object.assign(ctx.details, await renameAndApply(ctx, CUSTOMER, 'Name', 'FullName'))
      present(ctx, CUSTOMER, 'record Customer(string FullName', 'customer.FullName', 'FullName = name')
      present(ctx, CASE_TESTS, '.FullName')
      ctx.verify()
    },
  },
  {
    id: 'rename.generated-regex',
    language: 'csharp',
    async run(ctx) {
      const references = await ctx.session.references(PATTERNS, 'DigitsOnly()')
      ctx.details.referenceUris = [...new Set(references.map((r) => (r.uri.startsWith('file:') ? relative(ctx.session.root, pathOf(r.uri)).replaceAll('\\', '/') : r.uri)))]
      Object.assign(ctx.details, await renameAndApply(ctx, PATTERNS, 'DigitsOnly()', 'Digits'))
      present(ctx, PATTERNS, 'partial Regex Digits()', 'Digits().IsMatch')
      ctx.verify()
    },
  },
  {
    id: 'rename.generated-json-context',
    language: 'csharp',
    async run(ctx) {
      Object.assign(ctx.details, await renameAndApply(ctx, CUSTOMER, 'Customer(string', 'Client'))
      present(ctx, CUSTOMER, 'record Client(', 'typeof(Client)')
      ctx.verify()
    },
  },
  {
    id: 'references.into-generated-file',
    language: 'csharp',
    async run(ctx) {
      const { session } = ctx
      const references = await session.references(CASE_TESTS, 'CustomerInfo')
      const kinds = references.map((r) => (r.uri.startsWith('file:') ? 'file' : r.uri.split(':')[0]))
      ctx.details.referenceKinds = [...new Set(kinds)]
      ctx.details.count = references.length
      ctx.details.generatedLocations = references.filter((r) => !r.uri.startsWith('file:')).map((r) => r.uri.slice(0, 120)).slice(0, 3)
      const definition = await session.client.request('textDocument/definition', session.at(PATTERNS, 'DigitsOnly()', { occurrence: 1 }))
      ctx.details.definition = (Array.isArray(definition) ? definition : [definition]).filter(Boolean).map((d) => (d.uri ?? d.targetUri ?? '').slice(0, 140))
      must(references.length >= 2, 'fewer than two references to a symbol that the generator declares')
    },
  },
  {
    id: 'rename.file',
    language: 'csharp',
    async run(ctx) {
      const { session } = ctx
      const willRename = session.capabilities.workspace?.fileOperations?.willRename
      ctx.details.willRename = willRename ?? null
      session.open(MISNAMED)
      const actions = await codeActionsAt(ctx, MISNAMED, cursor(session, MISNAMED, 'Receipt', { within: 2 }))
      const titles = actions.map((a) => a.title)
      ctx.details.titlesAtType = titles.slice(0, 15)
      const candidate = actions.find((a) => /rename file/i.test(a.title) && !a.disabled)
      const covers = willRename?.filters?.some((f) => /(^|[.,{])cs([,}]|$)/.test(f.pattern?.glob ?? ''))
      if (!candidate && !covers) {
        let answer = 'not requested'
        try {
          const result = await session.client.request('workspace/willRenameFiles', { files: [{ oldUri: session.uri(LEDGER), newUri: session.uri('backend/Proof.LspCases/Ledger.Parts.cs') }] }, { timeoutMs: 20000 })
          answer = result ? `answered ${JSON.stringify(result).slice(0, 80)}` : 'answered null'
        } catch (error) {
          answer = `error: ${error.message.slice(0, 100)}`
        }
        ctx.details.requestedAnyway = answer
        throw new Unsupported(`willRename is not advertised for .cs files and no rename-file or move-type code action is offered at a type (${titles.length} actions: ${titles.slice(0, 6).join(' | ') || 'none'}); willRenameFiles answered: ${answer}`)
      }
      if (covers) {
        const oldUri = session.uri(LEDGER)
        const newUri = session.uri('backend/Proof.LspCases/Ledger.Parts.cs')
        const edit = (await session.client.request('workspace/willRenameFiles', { files: [{ oldUri, newUri }] })) ?? {}
        session.apply({ documentChanges: [...operationsOf(edit), { kind: 'rename', oldUri, newUri }] })
        ctx.verify()
        return { via: 'willRenameFiles' }
      }
      const applied = await applyAction(ctx, candidate)
      ctx.details.renameTypeOffered = actions.some((a) => /rename type/i.test(a.title))
      must(!existsSync(join(ctx.app, MISNAMED)) && existsSync(join(ctx.app, 'backend/Proof.LspCases/Receipt.cs')), 'the file was not renamed to Receipt.cs')
      ctx.verify()
      return { action: candidate.title, ...applied }
    },
  },
  {
    id: 'edit.body-replace',
    language: 'csharp',
    async run(ctx) {
      return bodyReplace(ctx, SHAPES, 'Describe', 'public static string Describe(IShape shape) => $"{shape.GetType().Name} has area {shape.Area():0.00}";', 'has area')
    },
  },
  {
    id: 'edit.insert-before-after',
    language: 'csharp',
    async run(ctx) {
      return insertAround(
        ctx,
        SAMPLE,
        'Label',
        '    public static int Doubled(int value) => value * 2;\n\n',
        '\n\n    public static int Tripled(int value) => value * 3;',
        ['Doubled(int value)', 'Tripled(int value)'],
      )
    },
  },
  {
    id: 'diagnostics',
    language: 'csharp',
    async run(ctx) {
      return diagnosticsCase(ctx, SAMPLE, 'Pricing.Total(quantity, unit)', 'Pricing.Totl(quantity, unit)')
    },
  },
  {
    id: 'hierarchy.type',
    language: 'csharp',
    async run(ctx) {
      return hierarchyCase(ctx, SHAPES, 'IShape', ['Circle', 'Square'], SHAPES, 'Circle(double', 'IShape')
    },
  },
  {
    id: 'codeactions.survey',
    language: 'csharp',
    async run(ctx) {
      return surveyCase(ctx, csharpPositions(ctx.session), [
        { name: 'unknown-method', file: SAMPLE, needle: 'Pricing.Total(quantity, unit)', replacement: 'Pricing.Totl(quantity, unit)', range: (s) => cursor(s, SAMPLE, 'Totl') },
        { name: 'extra-argument', file: SAMPLE, needle: 'Pricing.Total(quantity, unit)', replacement: 'Pricing.Total(quantity, unit, 0)', range: (s) => cursor(s, SAMPLE, 'Total(quantity, unit, 0)') },
      ])
    },
  },
  {
    id: 'codeactions.apply.organize-or-fix-all',
    language: 'csharp',
    async run(ctx) {
      const p = csharpPositions(ctx.session)
      return applyMatching(ctx, [p.unusedImport, { file: SAMPLE, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }], KIND_PATTERNS.E6, { kind: 'source' })
    },
  },
  {
    id: 'codeactions.apply.extract',
    language: 'csharp',
    async run(ctx) {
      const p = csharpPositions(ctx.session)
      return applyMatching(ctx, [p.statement, p.block, p.selection], KIND_PATTERNS.extract, { kind: 'refactor.extract' })
    },
  },
  {
    id: 'codeactions.apply.inline',
    language: 'csharp',
    async run(ctx) {
      const p = csharpPositions(ctx.session)
      return applyMatching(ctx, [p.variable], KIND_PATTERNS.inline, { kind: 'refactor.inline' })
    },
  },
  {
    id: 'codeactions.apply.move',
    language: 'csharp',
    async run(ctx) {
      const p = csharpPositions(ctx.session)
      return applyMatching(ctx, [p.typeDeclaration], KIND_PATTERNS.move, { kind: 'refactor.move' })
    },
  },
  {
    id: 'codeactions.apply.change-signature',
    language: 'csharp',
    async run(ctx) {
      const { session } = ctx
      await replaceText(ctx, SAMPLE, 'Pricing.Total(quantity, unit)', 'Pricing.Total(quantity, unit, 0)')
      const diagnostics = await pullDiagnostics(ctx, SAMPLE)
      const range = cursor(session, SAMPLE, 'Total(quantity, unit, 0)')
      return applyMatching(ctx, [{ file: SAMPLE, range, diagnostics }, { file: PRICING, range: cursor(session, PRICING, 'Total(int quantity') }], KIND_PATTERNS.E3)
    },
  },
]

function tsPositions(session) {
  return {
    signature: { file: PRICE_FORMAT, range: cursor(session, PRICE_FORMAT, 'formatPrice(price') },
    selection: { file: PRICE_FORMAT, range: rangeOf(session, PRICE_FORMAT, 'price.amount.toFixed(2)') },
    block: { file: PRICE_FORMAT, range: { start: locate(session.text(PRICE_FORMAT), 'export function totalPrice'), end: locate(session.text(PRICE_FORMAT), '}\n', { occurrence: 1, within: 1 }) } },
  }
}

const UNUSED_FILE = 'frontend/src/pages/pricing/ui/unused.ts'
const UNUSED_SOURCE = "import { formatPrice } from '@/shared/lib/price'\nimport type { Price } from '@/shared/lib/price'\n\nexport const used = (price: Price): number => price.amount\n"

async function writeUnused(ctx) {
  const { session } = ctx
  const uri = session.uri(UNUSED_FILE)
  session.apply({ documentChanges: [{ kind: 'create', uri, options: { overwrite: true } }, { textDocument: { uri, version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: UNUSED_SOURCE }] }] })
  session.resync(UNUSED_FILE)
}

export const typescriptCases = [
  {
    id: 'rename.barrel',
    language: 'typescript',
    async run(ctx) {
      Object.assign(ctx.details, await renameAndApply(ctx, PRICE_FORMAT, 'formatPrice', 'renderPrice'))
      present(ctx, PRICE_FORMAT, 'export function renderPrice')
      present(ctx, PRICE_INDEX, 'renderPrice')
      ctx.details.importersUpdated = ctx.session.text(PRICE_SUMMARY).includes('renderPrice(totalPrice(prices))')
      ctx.details.barrelAfter = ctx.session.text(PRICE_INDEX).trim().split(' from ')[0]
      ctx.verify()
    },
  },
  {
    id: 'rename.barrel-all-sites',
    language: 'typescript',
    requestHandlers: { 'workspace/configuration': (params) => params.items.map((item) => (['typescript', 'javascript', 'js/ts'].includes(item.section) ? { preferences: { useAliasesForRenames: false } } : null)) },
    async run(ctx) {
      Object.assign(ctx.details, await renameAndApply(ctx, PRICE_FORMAT, 'formatPrice', 'renderPrice'))
      present(ctx, PRICE_FORMAT, 'export function renderPrice')
      present(ctx, PRICE_INDEX, "export { renderPrice, totalPrice } from './format-price'")
      present(ctx, PRICE_SUMMARY, 'renderPrice(totalPrice(prices))')
      present(ctx, PRICE_TEST, "import { renderPrice, totalPrice } from './format-price'")
      ctx.verify()
    },
  },
  {
    id: 'rename.file',
    language: 'typescript',
    async run(ctx) {
      const { session } = ctx
      const filters = session.capabilities.workspace?.fileOperations?.willRename
      if (!filters) throw new Unsupported('willRename is not advertised')
      const oldUri = session.uri(PRICE_FORMAT)
      const newUri = session.uri('frontend/src/shared/lib/price/format-money.ts')
      session.open(PRICE_INDEX)
      const edit = (await session.client.request('workspace/willRenameFiles', { files: [{ oldUri, newUri }] })) ?? {}
      const summary = summarize(edit, session.root)
      Object.assign(ctx.details, summary)
      session.apply({ documentChanges: [...operationsOf(edit), { kind: 'rename', oldUri, newUri }] })
      session.client.notify('workspace/didRenameFiles', { files: [{ oldUri, newUri }] })
      present(ctx, PRICE_INDEX, "'./format-money'")
      present(ctx, PRICE_TEST, "from './format-money'")
      ctx.verify()
    },
  },
  {
    id: 'edit.body-replace',
    language: 'typescript',
    async run(ctx) {
      return bodyReplace(
        ctx,
        PRICE_FORMAT,
        'totalPrice',
        "export function totalPrice(prices: Price[]): Price {\n  const total = prices.reduce((sum, price) => sum + price.amount, 0)\n  return { amount: total, currency: prices[0]?.currency ?? 'EUR' }\n}",
        'const total = prices.reduce',
      )
    },
  },
  {
    id: 'edit.insert-before-after',
    language: 'typescript',
    async run(ctx) {
      return insertAround(
        ctx,
        PRICE_FORMAT,
        'totalPrice',
        'export function zeroPrice(): Price {\n  return { amount: 0, currency: \'EUR\' }\n}\n\n',
        '\n\nexport function doublePrice(price: Price): Price {\n  return { amount: price.amount * 2, currency: price.currency }\n}',
        ['zeroPrice', 'doublePrice'],
      )
    },
  },
  {
    id: 'diagnostics',
    language: 'typescript',
    async run(ctx) {
      return diagnosticsCase(ctx, PRICE_SUMMARY, 'totalPrice(prices)', 'totalPrice(prices, 1)')
    },
  },
  {
    id: 'hierarchy.type',
    language: 'typescript',
    async run(ctx) {
      const { session } = ctx
      if (!session.capabilities.typeHierarchyProvider) {
        let answer = 'not requested'
        try {
          session.open(PRICE_FORMAT)
          const result = await session.client.request('textDocument/prepareTypeHierarchy', session.at(PRICE_FORMAT, 'Price'), { timeoutMs: 20000 })
          answer = `answered ${JSON.stringify(result)?.slice(0, 60)}`
        } catch (error) {
          answer = `error: ${error.message.slice(0, 100)}`
        }
        ctx.details.requestedAnyway = answer
        throw new Unsupported(`typeHierarchyProvider is not advertised; prepareTypeHierarchy ${answer}`)
      }
      return {}
    },
  },
  {
    id: 'codeactions.survey',
    language: 'typescript',
    async run(ctx) {
      await writeUnused(ctx)
      const positions = { ...tsPositions(ctx.session), unusedImport: { file: UNUSED_FILE, range: cursor(ctx.session, UNUSED_FILE, 'import') } }
      return surveyCase(ctx, positions, [
        { name: 'unknown-name', file: PRICE_SUMMARY, needle: 'formatPrice(totalPrice(prices))', replacement: 'formatPrce(totalPrice(prices))', range: (s) => cursor(s, PRICE_SUMMARY, 'formatPrce') },
        { name: 'extra-argument', file: PRICE_SUMMARY, needle: 'totalPrice(prices)', replacement: 'totalPrice(prices, 1)', range: (s) => cursor(s, PRICE_SUMMARY, 'totalPrice(prices, 1)') },
      ])
    },
  },
  {
    id: 'codeactions.apply.organize-or-fix-all',
    language: 'typescript',
    async run(ctx) {
      await writeUnused(ctx)
      const diagnostics = await pullDiagnostics(ctx, UNUSED_FILE)
      const range = cursor(ctx.session, UNUSED_FILE, 'import')
      const result = await applyMatching(ctx, [{ file: UNUSED_FILE, range, diagnostics }, { file: UNUSED_FILE, range: { start: { line: 0, character: 0 }, end: { line: 4, character: 0 } } }], /organi[sz]e|remove unused|fix all/i, { kind: 'source.organizeImports' })
      absent(ctx, UNUSED_FILE, 'formatPrice')
      return result
    },
  },
  {
    id: 'codeactions.apply.extract',
    language: 'typescript',
    async run(ctx) {
      const p = tsPositions(ctx.session)
      return applyMatching(ctx, [p.selection, p.block], KIND_PATTERNS.extract, { kind: 'refactor.extract' })
    },
  },
  {
    id: 'codeactions.apply.inline',
    language: 'typescript',
    async run(ctx) {
      const p = tsPositions(ctx.session)
      return applyMatching(ctx, [p.signature], KIND_PATTERNS.inline, { kind: 'refactor.inline' })
    },
  },
  {
    id: 'codeactions.apply.move',
    language: 'typescript',
    async run(ctx) {
      const p = tsPositions(ctx.session)
      return applyMatching(ctx, [p.signature, p.block], KIND_PATTERNS.move, { kind: 'refactor.move' })
    },
  },
  {
    id: 'codeactions.apply.change-signature',
    language: 'typescript',
    async run(ctx) {
      const { session } = ctx
      await replaceText(ctx, PRICE_SUMMARY, 'totalPrice(prices)', 'totalPrice(prices, 1)')
      const diagnostics = await pullDiagnostics(ctx, PRICE_SUMMARY)
      return applyMatching(ctx, [{ file: PRICE_SUMMARY, range: cursor(session, PRICE_SUMMARY, 'totalPrice(prices, 1)'), diagnostics }], KIND_PATTERNS.E3)
    },
  },
]

export const casesFor = (server) => (server === 'typescript' ? typescriptCases : csharpCases)
