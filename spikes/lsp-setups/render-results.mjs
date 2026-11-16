import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ORDER = ['linux', 'macos', 'windows']
const SETUP_NAMES = ['plugins', 'lspjson', 'host']
const LANGUAGES = ['csharp', 'typescript', 'yaml']

export function loadResults(folder) {
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')))
    .sort((a, b) => ORDER.indexOf(a.os) - ORDER.indexOf(b.os))
}

const cell = (value) => (value === null || value === undefined || value === '' ? 'n/a' : String(value)).replaceAll('|', '/').replace(/\s+/g, ' ')
const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n')
const latency = (stats) => (stats && stats.runs ? `${stats.medianMs} / ${stats.p95Ms}` : 'n/a')
const yesNo = (value) => (value === undefined || value === null ? 'n/a' : value ? 'yes' : 'no')

function versionsSection(results) {
  const rows = results.map((r) => [
    r.os,
    r.versions?.pinned?.['csharp-ls'],
    r.versions?.global?.['csharp-ls'],
    r.versions?.pinned?.roslyn,
    r.versions?.pinned?.typescript,
    r.versions?.global?.typescript,
    r.versions?.pinned?.['yaml-language-server'],
    r.versions?.global?.['yaml-language-server'],
    r.versions?.dotnet,
    r.versions?.node,
  ])
  return ['## Versions', '', `Claude Code client emulated: ${results[0]?.versions?.claudeCodeClient}.`, '', table(['OS', 'csharp-ls pinned', 'csharp-ls global', 'Roslyn server', 'TypeScript pinned', 'TypeScript global', 'yaml-language-server pinned', 'yaml-language-server global', '.NET SDK', 'Node'], rows), '']
}

function installSection(results) {
  const out = ['## Install steps', '', 'Each command runs as its own timed CI step. The developer steps are the ones no CI step can do.', '']
  const rows = []
  for (const setup of SETUP_NAMES) {
    for (const step of results[0]?.setups?.[setup]?.installSteps ?? []) {
      rows.push([setup, `\`${step.command}\``, ...results.map((r) => r.setups?.[setup]?.installSteps?.find((s) => s.command === step.command)?.seconds)])
    }
  }
  out.push(table(['Set-up', 'Command', ...results.map((r) => `${r.os} s`)], rows), '')
  out.push('Developer steps per set-up:', '')
  for (const setup of SETUP_NAMES) out.push(`- ${setup}: ${(results[0]?.setups?.[setup]?.manualSteps ?? []).map((s) => `\`${s}\``).join(', ')}`)
  out.push('')
  return out
}

function attemptsSection(results) {
  const out = ['## lspjson: Roslyn launches without a custom notification', '']
  const first = results.find((r) => r.attempts)
  if (first?.attempts?.help !== undefined) out.push(`The help of the pinned server printed only: ${JSON.stringify(first.attempts.help.trim().split(/\r?\n/)[0] ?? '')}. The attempts are --stdio alone, every option of the help whose name mentions load, solution or project, and --autoLoadProjects, which the server may support although its help does not list it.`, '')
  const rows = []
  for (const r of results) {
    for (const attempt of r.attempts?.attempts ?? []) rows.push([r.os, attempt.id, `\`${attempt.args.join(' ')}\``, yesNo(attempt.loaded), attempt.loadMs, yesNo(attempt.pushedDiagnostics), attempt.pushMs, attempt.error])
  }
  out.push(table(['OS', 'Attempt', 'Arguments', 'Solution loaded', 'Load ms', 'Diagnostics pushed', 'Push ms', 'Error'], rows), '')
  out.push('csharp-ls under lspjson is identical to plugins: the same client emulation starting the same `csharp-ls --solution <it>` command.', '')
  return out
}

function correctnessSection(results) {
  const out = ['## Diagnostics after an edit', '', 'Five repeats per case. Correct means the broken edit produced the expected diagnostic and the fixing edit cleared it. Latency is the median / p95 in ms from the edit being sent to the right diagnostics arriving by the edit alone (didChange for push, didChange then pull for the host). Push set-ups wait 20 s after didChange and then send didSave and wait 20 s again.', '']
  const rows = []
  for (const setup of SETUP_NAMES) {
    for (const language of LANGUAGES) {
      for (const r of results) {
        const entry = r.correctness?.[setup]?.[language]
        const res = entry?.result
        rows.push([
          setup,
          language,
          r.os,
          entry?.server,
          res ? `${res.correct}/${res.repeats}` : entry?.error,
          res ? `${res.brokenFound}/${res.fixedCleared}` : null,
          res ? `${res.brokenNeededSave}/${res.fixedNeededSave}` : null,
          res ? `${res.stalePushes}/${res.emptyPushes}` : null,
          res ? latency(res.brokenLatency) : null,
          res ? latency(res.fixedLatency) : null,
          res?.mode,
        ])
      }
    }
  }
  out.push(table(['Set-up', 'Language', 'OS', 'Server', 'Correct', 'Broken found / fixed cleared', 'Needed didSave (broken/fixed)', 'Stale / empty pushes', 'Broken latency', 'Fixed latency', 'Mode'], rows), '')
  return out
}

function memorySection(results) {
  const out = ['## Servers running and memory', '', 'Resident memory of each set-up\'s whole process tree after load and the diagnostics workload. Combinations measured running together.', '']
  const rows = []
  for (const r of results) {
    for (const entry of r.memory ?? []) {
      const breakdown = (entry.samples ?? []).map((s) => `${s.member}: ${s.servers.map((x) => `${x.name} ${x.megabytes}`).join(', ')}`).join('; ')
      rows.push([r.os, entry.combination, entry.worktrees, entry.servers, entry.processes, entry.megabytes, entry.error ?? breakdown])
    }
  }
  out.push(table(['OS', 'Combination', 'Worktrees', 'Server processes', 'All processes', 'Total MB', 'Per server MB'], rows), '')
  return out
}

function worktreesSection(results) {
  const out = ['## Two worktrees', '', 'Roots: A the generated app, B at A/.claude/worktrees/B, C a sibling. Each cell is the findReferences check at that root: ok means the references were the expected ones and all inside the root (for YAML, every push was inside the root).', '']
  const rows = []
  for (const setup of SETUP_NAMES) {
    for (const language of LANGUAGES) {
      for (const r of results) {
        const entries = r.worktrees?.setups?.[setup]?.[language] ?? []
        rows.push([setup, language, r.os, ...['A', 'B', 'C'].map((name) => {
          const e = entries.find((x) => x.root === name)
          if (!e) return 'n/a'
          if (e.error) return `error: ${e.error.slice(0, 80)}`
          return `${e.correct && e.outside.length === 0 ? 'ok' : 'wrong'}${e.solutionInsideRoot === undefined ? '' : e.solutionInsideRoot ? ', own solution' : ', other solution'}`
        })])
      }
    }
  }
  out.push(table(['Set-up', 'Language', 'OS', 'A', 'B', 'C'], rows), '')
  out.push('Control: the official plugin starts `csharp-ls` with no `--solution`.', '')
  const control = []
  for (const r of results) {
    for (const e of r.worktrees?.control ?? []) {
      control.push([r.os, e.root, (e.solutionsUnderRoot ?? []).length, e.skipped ?? yesNo(e.correct), e.referenceCount, (e.outside ?? []).length, (e.logLines ?? []).slice(0, 2).join(' / '), e.error])
    }
  }
  out.push(table(['OS', 'Root', 'Solutions under the root', 'Correct references', 'References returned', 'References outside the root or in a worktree copy', 'Server log', 'Error'], control), '')
  return out
}

function hookSection(results) {
  const out = ['## D1 through a PostToolUse hook (host)', '', 'Wall time of the whole hook process: node start, connect, sync, pull, print. Warm runs alternate a broken and a fixed edit. Cold runs start with no daemon: the wait is a run with a long deadline; the misses are runs at the default deadline that printed nothing before the first one that did.', '']
  const rows = []
  for (const r of results) {
    for (const language of LANGUAGES) {
      const e = r.hook?.languages?.[language]
      if (!e) continue
      const cold = e.cold ?? []
      const median = (key) => {
        const values = cold.map((c) => c[key]).filter(Number.isFinite).sort((a, b) => a - b)
        return values.length ? values[Math.floor(values.length / 2)] : null
      }
      rows.push([r.os, language, e.warm?.count, `${e.warm?.correct ?? 'n/a'}/${e.warm?.count ?? 'n/a'}`, e.warm?.medianMs, e.warm?.p95Ms, e.warm?.recommendedDeadlineMs, median('fullWaitMs'), cold.map((c) => c.missesBeforeFirstOutput).join(','), median('firstOutputMs'), e.error])
    }
  }
  out.push(table(['OS', 'Language', 'Warm runs', 'Correct', 'Warm median ms', 'Warm p95 ms', 'Deadline of twice p95 ms', 'Cold full wait median ms', 'Cold misses per repeat', 'Cold first output median ms', 'Error'], rows), '')
  out.push(`The hook's default deadline is ${results[0]?.hookDefaultDeadlineMs} ms.`, '')
  return out
}

export function render(results, { runUrl, head } = {}) {
  const out = ['# Language-server set-ups spike: results', '']
  if (!results.length) return `${out.join('\n')}\nNo result files.\n`
  out.push('Generated by `node render-results.mjs` from `results/<os>.json`.', '')
  if (runUrl) out.push(`CI run: ${runUrl}${head ? ` at ${head}` : ''}.`, '')
  out.push(...versionsSection(results), ...installSection(results), ...attemptsSection(results), ...correctnessSection(results), ...memorySection(results), ...worktreesSection(results), ...hookSection(results))
  return `${out.join('\n')}\n`
}

if (process.argv[1] && process.argv[1].endsWith('render-results.mjs')) {
  const option = (name) => {
    const index = process.argv.indexOf(`--${name}`)
    return index > 0 ? process.argv[index + 1] : undefined
  }
  writeFileSync(join(here, 'RESULTS.md'), render(loadResults(join(here, 'results')), { runUrl: option('run'), head: option('head') }))
}
