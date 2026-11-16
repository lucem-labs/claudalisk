import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ensureBase } from '../lsp-host/lib/fixture.mjs'
import { OS, log, spikeDirectory } from './lib/common.mjs'
import { claudeCodeVersion } from './lib/claude-code-client.mjs'
import { globalDotnetTool, globalNodeScript } from './lib/launch.mjs'
import { SETUPS, readPart, writePart } from './lib/setups.mjs'
import { readInstallLog } from './install-step.mjs'
import { errorsIn, mergeParts, PARTS } from './lib/merge.mjs'

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? process.argv[index + 1] : undefined
}

function versions() {
  const manifest = JSON.parse(readFileSync(join(spikeDirectory, '.config', 'dotnet-tools.json'), 'utf8')).tools
  const packageVersion = (name) => {
    const path = join(spikeDirectory, 'node_modules', name, 'package.json')
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).version : null
  }
  const dotnet = spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).stdout?.trim()
  const list = spawnSync('dotnet', ['tool', 'list', '--global'], { encoding: 'utf8' }).stdout ?? ''
  const globalCsharpLs = /^csharp-ls\s+(\S+)/m.exec(list)?.[1] ?? null
  const globalVersion = (name) => {
    const script = globalNodeScript(name, 'package.json')
    return script ? JSON.parse(readFileSync(script, 'utf8')).version : null
  }
  return {
    claudeCodeClient: claudeCodeVersion,
    node: process.version,
    dotnet,
    pinned: {
      'csharp-ls': manifest['csharp-ls'].version,
      roslyn: manifest['roslyn-language-server'].version,
      typescript: packageVersion('typescript'),
      'yaml-language-server': packageVersion('yaml-language-server'),
    },
    global: {
      'csharp-ls': globalDotnetTool('csharp-ls') ? globalCsharpLs : null,
      typescript: globalVersion('typescript'),
      'yaml-language-server': globalVersion('yaml-language-server'),
    },
  }
}

async function main() {
  const part = option('part')
  if (part === 'merge') {
    const parts = Object.fromEntries(PARTS.map((name) => [name, readPart(name)]))
    const result = mergeParts({ parts, install: readInstallLog(), versionInfo: versions() })
    const target = option('out') ?? join(spikeDirectory, 'results', `${OS}.json`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`)
    log(`wrote ${target}`)
    const missing = PARTS.filter((name) => !parts[name])
    if (missing.length) {
      log(`missing parts: ${missing.join(', ')}`)
      process.exit(1)
    }
    return
  }
  if (!PARTS.includes(part)) {
    log(`Usage: node measure.mjs --part <${[...PARTS, 'merge'].join('|')}>`)
    process.exit(2)
  }
  const { base, work } = await ensureBase()
  log(`[${OS}] ${part}`)
  let data
  if (part === 'attempts') data = await (await import('./lib/part-correctness.mjs')).attemptsPart({ base, work })
  if (part === 'correctness') data = await (await import('./lib/part-correctness.mjs')).correctnessPart({ base, work })
  if (part === 'worktrees') data = await (await import('./lib/part-worktrees.mjs')).worktreesPart({ base, work })
  if (part === 'memory') data = await (await import('./lib/part-memory.mjs')).memoryPart({ base, work })
  if (part === 'hook') data = await (await import('./lib/part-hook.mjs')).hookPart({ base, work })
  log(`wrote ${writePart(part, data)}`)
  const errors = part === 'attempts' ? [] : errorsIn(data)
  if (errors.length) {
    for (const error of errors) log(`error in ${error}`)
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].endsWith('measure.mjs')) await main()
