import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnArguments } from '../../tools/registry.mjs'
import { spikeDirectory } from './lib/common.mjs'

export const installLog = () => process.env.LSP_SETUPS_INSTALL_LOG ?? join(spikeDirectory, 'results', 'parts', 'install.json')

export function readInstallLog(path = installLog()) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
}

export function runStep(setup, command, args, { cwd = process.cwd(), path = installLog() } = {}) {
  const started = performance.now()
  const [file, fileArgs, options] = spawnArguments(command, args, cwd)
  const result = spawnSync(file, fileArgs, { ...options, windowsHide: true })
  const seconds = Math.round(((performance.now() - started) / 1000) * 10) / 10
  const entries = readInstallLog(path)
  entries.push({ setup, command: [command, ...args].join(' '), cwd: resolve(cwd), seconds, ok: result.status === 0 })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`)
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [setup, command, ...args] = process.argv.slice(2)
  if (!setup || !command) {
    process.stderr.write('Usage: node install-step.mjs <setup> <command> [args...]\n')
    process.exit(2)
  }
  process.exit(runStep(setup, command, args))
}
