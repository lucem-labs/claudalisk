import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EmulatedClient } from './claude-code-client.mjs'
import { HostServer } from './host-server.mjs'
import { YAML_SETTINGS, launchServer } from './launch.mjs'
import { spikeDirectory } from './common.mjs'

export const LANGUAGES = ['csharp', 'typescript', 'yaml']

export const SETUPS = {
  plugins: {
    title: 'plugins',
    description: 'the wrapper plugins of CLA-0080, driven by the Claude Code client',
    driver: 'push',
    serverOf: { csharp: 'csharp-ls', typescript: 'typescript', yaml: 'yaml' },
    source: 'global',
    manualSteps: [
      'claude plugin install csharp-ls-lsp@claude-toolkit',
      'claude plugin install ts7-lsp@claude-toolkit',
      'claude plugin install yaml-lsp@claude-toolkit',
      'dotnet tool install --global csharp-ls',
      'npm install -g typescript@7',
      'npm install -g yaml-language-server',
    ],
  },
  lspjson: {
    title: 'lspjson',
    description: "claudalisk's own .lsp.json, driven by the Claude Code client",
    driver: 'push',
    serverOf: { csharp: 'roslyn', typescript: 'typescript', yaml: 'yaml' },
    source: 'pinned',
    manualSteps: [
      'claude plugin install claudalisk',
      'dotnet tool install --global roslyn-language-server --prerelease',
      'npm install -g typescript@7',
      'npm install -g yaml-language-server',
    ],
  },
  host: {
    title: 'host',
    description: "claudalisk's host, driven by the lsp-host client with pulled diagnostics",
    driver: 'pull',
    serverOf: { csharp: 'roslyn', typescript: 'typescript', yaml: 'yaml' },
    source: 'pinned',
    manualSteps: ['dotnet tool restore', 'npm ci'],
  },
}

export const COMBINATIONS = [['plugins'], ['lspjson'], ['host'], ['plugins', 'host'], ['lspjson', 'host']]

export const settingsOf = (language) => (language === 'yaml' ? YAML_SETTINGS : undefined)

export async function startEmulated(setup, language, root, { roslynArgs, log = () => {} } = {}) {
  const definition = SETUPS[setup]
  const launched = launchServer(definition.serverOf[language], root, { source: definition.source, roslynArgs, log })
  const client = new EmulatedClient({ spec: launched.spec, root, settings: settingsOf(language) })
  await client.start()
  return { client, launched, language, setup, server: definition.serverOf[language] }
}

export async function startHost(language, root, { log = () => {} } = {}) {
  const server = await HostServer.start(language, root, { log })
  await server.waitLoaded()
  return { client: server, launched: server.launch, language, setup: 'host', server: server.launch.id ?? language }
}

export async function startSetup(setup, language, root, options = {}) {
  if (SETUPS[setup].driver === 'pull') return startHost(language, root, options)
  return startEmulated(setup, language, root, options)
}

export function partsFolder() {
  const folder = process.env.LSP_SETUPS_PARTS ?? join(spikeDirectory, 'results', 'parts')
  mkdirSync(folder, { recursive: true })
  return folder
}

export function writePart(name, data) {
  const path = join(partsFolder(), `${name}.json`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
  return path
}

export function readPart(name) {
  const path = join(partsFolder(), `${name}.json`)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

export function chosenRoslynArgs() {
  return readPart('attempts')?.chosen?.args ?? ['--stdio']
}
