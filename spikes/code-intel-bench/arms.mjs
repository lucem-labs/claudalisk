import { basename } from 'node:path'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, normalize, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { benchRoot } from './lib.mjs'

export const armsRoot = join(benchRoot, 'arms')
const LEFT_OUT = new Set(['spikes', '.git'])
const ALWAYS_OUT = [join('spikes', 'code-intel-bench')]
const ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}'

export function loadArm(name, root = armsRoot) {
  const folder = join(root, name)
  const file = join(folder, 'arm.json')
  if (!existsSync(file)) throw new Error(`There is no arm ${name} in ${root}`)
  const arm = JSON.parse(readFileSync(file, 'utf8'))
  for (const key of ['pluginDir', 'settings']) {
    if (!arm[key]) throw new Error(`${file} has no ${key}`)
  }
  const models = arm.models ?? (arm.model ? [arm.model] : [])
  if (!Array.isArray(models) || !models.length || models.some((model) => typeof model !== 'string' || !model)) throw new Error(`${file} has no models`)
  const include = arm.include ?? []
  if (!Array.isArray(include) || include.some((path) => typeof path !== 'string' || !path)) throw new Error(`${file} has an invalid include`)
  if (arm.toolPattern !== undefined) new RegExp(arm.toolPattern)
  const agents = loadAgents(arm.agents, folder, file)
  const hooks = loadHooks(arm.hooks, folder, file)
  return {
    name,
    folder,
    models,
    pluginDir: resolve(folder, arm.pluginDir),
    settings: resolve(folder, arm.settings),
    include: include.map((path) => normalize(path)),
    ...(arm.overlay ? { overlay: resolve(folder, arm.overlay) } : {}),
    ...(arm.toolPattern ? { toolPattern: arm.toolPattern } : {}),
    ...(agents ? { agents } : {}),
    ...(hooks ? { hooks } : {}),
  }
}

function loadHooks(hooks, folder, file) {
  if (hooks === undefined) return undefined
  if (!Array.isArray(hooks)) throw new Error(`${file} has an invalid hooks`)
  return hooks.map((hook, index) => {
    if (!hook || typeof hook.script !== 'string' || !hook.script) throw new Error(`${file} has no script for hook ${index}`)
    if (typeof hook.matcher !== 'string' || !hook.matcher) throw new Error(`${file} has no matcher for hook ${index}`)
    const args = hook.args ?? []
    if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) throw new Error(`${file} has an invalid args for hook ${index}`)
    const script = resolve(folder, hook.script)
    if (!existsSync(script)) throw new Error(`The script ${script} of hook ${index} does not exist`)
    return { script, scriptName: hook.script, matcher: hook.matcher, args }
  })
}

function loadAgents(agents, folder, file) {
  if (agents === undefined) return undefined
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) throw new Error(`${file} has an invalid agents`)
  return Object.fromEntries(
    Object.entries(agents).map(([name, change]) => {
      const addTools = change?.addTools ?? []
      if (!Array.isArray(addTools) || addTools.some((tool) => typeof tool !== 'string' || !tool)) throw new Error(`${file} has an invalid addTools for agent ${name}`)
      if (change?.note !== undefined && (typeof change.note !== 'string' || !change.note)) throw new Error(`${file} has an invalid note for agent ${name}`)
      const note = change?.note ? resolve(folder, change.note) : undefined
      if (note && !existsSync(note)) throw new Error(`The note ${note} of agent ${name} does not exist`)
      return [name, { addTools, ...(note ? { note, noteName: change.note } : {}) }]
    }),
  )
}

export function armForModel(arm, model) {
  if (!arm.models.includes(model)) throw new Error(`Arm ${arm.name} has no model ${model}; it has ${arm.models.join(', ')}`)
  return { ...arm, model }
}

const inside = (path, folder) => path === folder || path.startsWith(`${folder}${sep}`)

export function isLeftOut(source, pluginDir, include = []) {
  const path = relative(pluginDir, source)
  const [top] = path.split(sep)
  if (top === '.git') return true
  if (ALWAYS_OUT.some((folder) => inside(path, folder))) return true
  if (!LEFT_OUT.has(top)) return false
  return !include.some((entry) => inside(path, entry) || inside(entry, path))
}

function textFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    return entry.isDirectory() ? textFiles(path) : [path]
  })
}

export function applyOverlay(overlay, destination) {
  if (!existsSync(overlay) || !statSync(overlay).isDirectory()) throw new Error(`The overlay ${overlay} is not a folder`)
  cpSync(overlay, destination, { recursive: true, force: true })
  const root = resolve(destination).split(sep).join('/')
  for (const file of textFiles(overlay)) {
    if (!file.endsWith('.md')) continue
    const staged = join(destination, relative(overlay, file))
    writeFileSync(staged, readFileSync(staged, 'utf8').split(ROOT_TOKEN).join(root))
  }
}

export function stagePlugin(pluginDir, destination, { include = [], overlay } = {}) {
  cpSync(pluginDir, destination, { recursive: true, filter: (source) => !isLeftOut(source, pluginDir, include) })
  if (overlay) applyOverlay(overlay, destination)
  return destination
}

export const SETTING_SOURCES = 'project,local'

export function claudeArguments({ arm, plugin, budget }) {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--plugin-dir', plugin,
    '--setting-sources', SETTING_SOURCES,
    '--settings', arm.settings,
    '--model', arm.model,
    '--max-budget-usd', String(budget),
    '--permission-mode', 'bypassPermissions',
  ]
}

export const MCP_TOOLS_TOKEN = '${mcpTools}'
export const MCP_READ_TOOLS_TOKEN = '${mcpReadTools}'
export const HOOKS_FOLDER = join('hooks', 'arm')

export async function mcpToolNames(plugin, { readOnly = false } = {}) {
  const { name } = JSON.parse(readFileSync(join(plugin, '.claude-plugin', 'plugin.json'), 'utf8'))
  const { mcpServers = {} } = JSON.parse(readFileSync(join(plugin, '.mcp.json'), 'utf8'))
  const names = []
  for (const [server, config] of Object.entries(mcpServers)) {
    const serverArgs = config.args ?? []
    const readServer = serverArgs.includes('--read-only')
    if (readServer && !readOnly) continue
    const entry = serverArgs.find((argument) => /spikes\/code-intel\/[^/]+\/mcp\.mjs$/.test(argument))
    if (!entry) continue
    const tools = join(plugin, ...entry.replace(ROOT_TOKEN, '').split('/').filter(Boolean).slice(0, -1), 'tools.mjs')
    const module = await import(pathToFileURL(tools).href)
    const served = readServer ? (module.readTools ?? module.tools) : module.tools
    for (const tool of served) if (!readOnly || tool.annotations?.readOnlyHint === true) names.push(`mcp__plugin_${name}_${server}__${tool.name}`)
  }
  return names
}

function withTools(text, tools, file) {
  const pattern = /^tools:[^\r\n]*/m
  const match = text.match(pattern)
  if (!match) throw new Error(`${file} has no tools line`)
  const current = match[0].slice('tools:'.length).split(',').map((tool) => tool.trim()).filter(Boolean)
  const added = tools.filter((tool) => !current.includes(tool))
  return { text: text.replace(pattern, `tools: ${[...current, ...added].join(', ')}`), added }
}

const withoutFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')

export async function applyAgents(plugin, agents = {}) {
  const root = resolve(plugin).split(sep).join('/')
  const changes = []
  let mcp
  let mcpRead
  const all = async () => (mcp ??= await mcpToolNames(plugin))
  const reads = async () => (mcpRead ??= await mcpToolNames(plugin, { readOnly: true }))
  for (const [agent, change] of Object.entries(agents)) {
    const file = join(plugin, 'agents', `${agent}.md`)
    if (!existsSync(file)) throw new Error(`The plugin has no agent ${agent}`)
    const wanted = []
    for (const tool of change.addTools ?? []) {
      if (tool === MCP_TOOLS_TOKEN) wanted.push(...(await all()))
      else if (tool === MCP_READ_TOOLS_TOKEN) wanted.push(...(await reads()))
      else wanted.push(tool)
    }
    const { text, added } = withTools(readFileSync(file, 'utf8'), wanted, file)
    let result = text
    if (change.note) {
      const note = withoutFrontmatter(readFileSync(change.note, 'utf8')).trim().split(ROOT_TOKEN).join(root).split(MCP_TOOLS_TOKEN).join((await all()).join(', ')).split(MCP_READ_TOOLS_TOKEN).join((await reads()).join(', '))
      result = `${text.trimEnd()}

## Code intelligence

${note}
`
    }
    writeFileSync(file, result)
    changes.push({ agent, addedTools: added, ...(change.note ? { note: change.noteName ?? change.note } : {}) })
  }
  return changes
}

const quoted = (text) => `"${text.replaceAll('"', '\\"')}"`

export function applyHooks(plugin, hooks = []) {
  if (!hooks.length) return []
  const root = resolve(plugin).split(sep).join('/')
  const file = join(plugin, 'hooks', 'hooks.json')
  if (!existsSync(file)) throw new Error(`The plugin has no ${file}`)
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const entries = (config.hooks ??= {}).PreToolUse ??= []
  mkdirSync(join(plugin, HOOKS_FOLDER), { recursive: true })
  const changes = []
  for (const hook of hooks) {
    const staged = join(HOOKS_FOLDER, basename(hook.script))
    cpSync(hook.script, join(plugin, staged))
    const args = hook.args.map((argument) => argument.split(ROOT_TOKEN).join(root))
    const command = ['node', `"${ROOT_TOKEN}/${staged.split(sep).join('/')}"`, ...args.map(quoted)].join(' ')
    entries.push({ matcher: hook.matcher, hooks: [{ type: 'command', command }] })
    changes.push({ script: hook.scriptName ?? hook.script, matcher: hook.matcher, args })
  }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}
`)
  return changes
}
