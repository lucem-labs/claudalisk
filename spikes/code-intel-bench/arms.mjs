import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { benchRoot } from './lib.mjs'

export const armsRoot = join(benchRoot, 'arms')
const LEFT_OUT = new Set(['spikes', '.git'])

export function loadArm(name, root = armsRoot) {
  const folder = join(root, name)
  const file = join(folder, 'arm.json')
  if (!existsSync(file)) throw new Error(`There is no arm ${name} in ${root}`)
  const arm = JSON.parse(readFileSync(file, 'utf8'))
  for (const key of ['pluginDir', 'settings', 'model']) {
    if (!arm[key]) throw new Error(`${file} has no ${key}`)
  }
  return { name, folder, model: arm.model, pluginDir: resolve(folder, arm.pluginDir), settings: resolve(folder, arm.settings) }
}

export function isLeftOut(source, pluginDir) {
  const [top] = relative(pluginDir, source).split(sep)
  return LEFT_OUT.has(top)
}

export function stagePlugin(pluginDir, destination) {
  cpSync(pluginDir, destination, { recursive: true, filter: (source) => !isLeftOut(source, pluginDir) })
  return destination
}

export function claudeArguments({ arm, plugin, budget }) {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--plugin-dir', plugin,
    '--setting-sources', 'project,local',
    '--settings', arm.settings,
    '--model', arm.model,
    '--max-budget-usd', String(budget),
    '--permission-mode', 'bypassPermissions',
  ]
}
