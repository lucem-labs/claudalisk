import { uriOf } from './edits.mjs'

export const CODE_ACTION_KINDS = [
  'quickfix',
  'refactor',
  'refactor.extract',
  'refactor.inline',
  'refactor.move',
  'refactor.rewrite',
  'source',
  'source.organizeImports',
  'source.fixAll',
]

export function clientCapabilities() {
  return {
    workspace: {
      applyEdit: true,
      workspaceEdit: {
        documentChanges: true,
        resourceOperations: ['create', 'rename', 'delete'],
        failureHandling: 'abort',
        normalizesLineEndings: false,
      },
      configuration: true,
      workspaceFolders: true,
      didChangeConfiguration: { dynamicRegistration: false },
      didChangeWatchedFiles: { dynamicRegistration: false },
      symbol: { dynamicRegistration: false },
      fileOperations: { dynamicRegistration: false, willRename: true, didRename: true, willCreate: true, willDelete: true },
    },
    window: { workDoneProgress: true },
    textDocument: {
      synchronization: { dynamicRegistration: false, didSave: true },
      publishDiagnostics: { relatedInformation: true, versionSupport: true },
      diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false },
      rename: { dynamicRegistration: false, prepareSupport: true },
      references: { dynamicRegistration: false },
      definition: { dynamicRegistration: false, linkSupport: true },
      implementation: { dynamicRegistration: false, linkSupport: true },
      documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
      callHierarchy: { dynamicRegistration: false },
      typeHierarchy: { dynamicRegistration: false },
      codeAction: {
        dynamicRegistration: false,
        isPreferredSupport: true,
        disabledSupport: true,
        dataSupport: true,
        resolveSupport: { properties: ['edit'] },
        codeActionLiteralSupport: { codeActionKind: { valueSet: CODE_ACTION_KINDS } },
      },
    },
  }
}

export function initializeParams(root) {
  const uri = uriOf(root)
  return {
    processId: process.pid,
    clientInfo: { name: 'lsp-host-spike', version: '0.0.0' },
    locale: 'en',
    rootPath: root,
    rootUri: uri,
    workspaceFolders: [{ uri, name: 'workspace' }],
    capabilities: clientCapabilities(),
    initializationOptions: {},
    trace: 'off',
  }
}

export const position = (line, character) => ({ line, character })
export const range = (startLine, startCharacter, endLine, endCharacter) => ({
  start: position(startLine, startCharacter),
  end: position(endLine, endCharacter),
})

export function flattenSymbols(symbols, prefix = []) {
  const flat = []
  for (const symbol of symbols ?? []) {
    const path = [...prefix, symbol.name]
    flat.push({ ...symbol, path })
    if (symbol.children) flat.push(...flattenSymbols(symbol.children, path))
  }
  return flat
}

export function locationsOf(result) {
  if (!result) return []
  return (Array.isArray(result) ? result : [result]).map((l) => ({ uri: l.uri ?? l.targetUri, range: l.range ?? l.targetSelectionRange ?? l.targetRange }))
}
