import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { casesFor } from './lib/cases.mjs'
import { ensureBase } from './lib/fixture.mjs'
import { median } from './lib/memory.mjs'
import { runCase } from './lib/runner.mjs'
import { warmMeasurement } from './lib/warm.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OS = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform] ?? process.platform
const ALL = ['csharp-ls', 'roslyn', 'typescript']

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? process.argv[index + 1] : undefined
}

const log = (line) => process.stderr.write(`${line}\n`)

function versions(base) {
  const manifest = JSON.parse(readFileSync(join(here, '.config', 'dotnet-tools.json'), 'utf8')).tools
  const typescript = JSON.parse(readFileSync(join(here, 'node_modules', 'typescript', 'package.json'), 'utf8')).version
  const dotnet = spawnSync('dotnet', ['--version'], { cwd: base, encoding: 'utf8' }).stdout.trim()
  return { 'csharp-ls': manifest['csharp-ls'].version, roslyn: manifest['roslyn-language-server'].version, typescript, dotnet, node: process.version }
}

async function measure({ servers = ALL, filter = '', warmRuns }) {
  const { base, work } = await ensureBase()
  const out = { os: OS, platform: process.platform, arch: process.arch, versions: versions(base), date: new Date().toISOString(), servers: {} }
  for (const server of servers) {
    const entry = { cases: [], warm: null }
    out.servers[server] = entry
    let startFailures = 0
    let skipReason
    let index = 0
    for (const definition of casesFor(server).filter((d) => d.id.includes(filter))) {
      index++
      if (skipReason) {
        entry.cases.push({ id: definition.id, server, status: 'fail', reason: skipReason, details: {} })
        continue
      }
      log(`[${OS}] ${server} ${definition.id}`)
      const record = await runCase({ server, definition, base, work, name: `${server}-${index}` })
      log(`[${OS}] ${server} ${definition.id}: ${record.status}${record.reason ? ` (${record.reason.slice(0, 160)})` : ''} in ${Math.round(record.ms / 1000)}s`)
      entry.cases.push(record)
      startFailures = record.phase === 'start' ? startFailures + 1 : 0
      if (startFailures >= 2) skipReason = `the server did not start in the two previous cases: ${record.reason.slice(0, 300)}`
    }
    const colds = entry.cases.map((c) => c.coldStartMs).filter(Number.isFinite)
    entry.coldStart = colds.length ? { samples: colds.length, medianMs: median(colds), minMs: Math.min(...colds), maxMs: Math.max(...colds) } : null
    const memories = entry.cases.map((c) => c.memoryMb).filter(Number.isFinite)
    entry.memoryAfterCasesMb = memories.length ? Math.max(...memories) : null
    if (!skipReason) {
      try {
        log(`[${OS}] ${server} warm`)
        entry.warm = await warmMeasurement({ server, base, work, runs: warmRuns })
      } catch (error) {
        entry.warm = { error: String(error.message).slice(0, 400) }
      }
    }
  }
  return out
}

const servers = option('servers')?.split(',') ?? ALL
const result = await measure({ servers, filter: option('cases') ?? '', warmRuns: option('runs') ? Number(option('runs')) : undefined })
const target = option('out') ?? join(here, 'results', `${OS}.json`)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`)
log(`wrote ${target}`)
