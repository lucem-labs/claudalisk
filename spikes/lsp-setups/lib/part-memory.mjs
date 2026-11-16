import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { caseFolder, copyFresh } from '../../lsp-host/lib/fixture.mjs'
import { removeApp } from '../../lsp-host/lib/runner.mjs'
import { processRows, treeOf } from '../../lsp-host/lib/memory.mjs'
import { DIAGNOSTIC_CASES, hasMatch, lacksMatch, prepareApp, runPushCase, waitReady, writeCase } from './cases.mjs'
import { COMBINATIONS, LANGUAGES, chosenRoslynArgs, startEmulated } from './setups.mjs'
import { endpointFor, isAbsent, request } from './daemon-protocol.mjs'
import { pickSolution } from './launch.mjs'
import { log, now, sleep, spikeDirectory } from './common.mjs'


const megabytes = (bytes) => Math.round(bytes / (1024 * 1024))
const sumBytes = (rows) => rows.reduce((sum, row) => sum + row.bytes, 0)

async function startDaemon(root) {
  const script = join(spikeDirectory, 'host-daemon.mjs')
  const child = spawn(process.execPath, [script, '--root', root], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  const endpoint = endpointFor(root)
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      await request(endpoint, { method: 'status' }, { timeoutMs: 2000 })
      return endpoint
    } catch (error) {
      if (!isAbsent(error)) throw error
      await sleep(100)
    }
  }
  throw new Error('the host daemon did not answer')
}

async function daemonDiagnostics(endpoint, app, language, want) {
  const definition = DIAGNOSTIC_CASES[language]
  const predicate = want === 'match' ? hasMatch(language) : lacksMatch(language)
  const file = join(app, definition.file)
  const deadline = now() + 20000
  let first = true
  for (;;) {
    const answer = await request(endpoint, { method: 'diagnostics', file, deadlineMs: first ? 600000 : 5000 }, { timeoutMs: first ? 610000 : 10000 })
    first = false
    if (answer.ok && !answer.pending && !answer.skipped && predicate(answer.diagnostics.map((d) => ({ message: d.message, code: d.code })))) return true
    if (now() >= deadline) return false
    await sleep(100)
  }
}

async function startMember(member, root, log) {
  if (member === 'host') {
    const endpoint = await startDaemon(root)
    const members = { member, root, endpoint, daemon: true }
    for (const language of LANGUAGES) {
      await request(endpoint, { method: 'diagnostics', file: join(root, DIAGNOSTIC_CASES[language].file), deadlineMs: 600000 }, { timeoutMs: 610000 })
    }
    members.workload = async () => {
      const results = {}
      for (const language of LANGUAGES) {
        writeCase(root, language, 'broken')
        const found = await daemonDiagnostics(endpoint, root, language, 'match')
        writeCase(root, language, 'good')
        const cleared = await daemonDiagnostics(endpoint, root, language, 'clear')
        results[language] = { found, cleared }
      }
      return results
    }
    members.sample = async (rows) => {
      const status = await request(endpoint, { method: 'status' })
      const tree = treeOf(rows, status.pid)
      const servers = Object.entries(status.servers).map(([language, info]) => {
        const rowsOfServer = info.pid ? treeOf(rows, info.pid) : []
        return { name: `${language}`, pid: info.pid, processes: rowsOfServer.length, megabytes: megabytes(sumBytes(rowsOfServer)) }
      })
      const serverBytes = servers.reduce((sum, s) => sum + s.megabytes, 0)
      return {
        member,
        daemonPid: status.pid,
        servers: [...servers, { name: 'daemon', pid: status.pid, processes: 1, megabytes: Math.max(0, megabytes(sumBytes(tree)) - serverBytes) }],
        processes: tree.length,
        megabytes: megabytes(sumBytes(tree)),
      }
    }
    members.stop = async () => {
      await request(endpoint, { method: 'shutdown' }).catch(() => {})
      await sleep(1500)
    }
    return members
  }
  const clients = []
  for (const language of LANGUAGES) {
    const roslynArgs = member === 'lspjson' ? chosenRoslynArgs().map((arg) => (arg === '@solution' ? pickSolution(root) : arg)) : undefined
    const started = await startEmulated(member, language, root, { roslynArgs, log })
    const ready = await waitReady(started.client, language, { timeoutMs: 300000, log })
    clients.push({ ...started, ready })
  }
  return {
    member,
    root,
    clients,
    workload: async () => {
      const results = {}
      for (const entry of clients) {
        const summary = await runPushCase(entry.client, root, entry.language, { repeats: 1, waitMs: 20000 })
        results[entry.language] = { found: summary.brokenFound === 1, cleared: summary.fixedCleared === 1 }
      }
      return results
    },
    sample: async (rows) => {
      const servers = clients.map((entry) => {
        const tree = treeOf(rows, entry.client.pid)
        return { name: `${entry.language}:${entry.server}`, pid: entry.client.pid, processes: tree.length, megabytes: megabytes(sumBytes(tree)) }
      })
      return { member, servers, processes: servers.reduce((s, x) => s + x.processes, 0), megabytes: servers.reduce((s, x) => s + x.megabytes, 0) }
    },
    stop: async () => {
      for (const entry of clients) await entry.client.stop().catch(() => entry.client.client.child?.kill())
    },
  }
}

export async function memoryPart({ base, work, combinations = COMBINATIONS, counts = [1, 2] }) {
  const out = []
  for (const combination of combinations) {
    for (const count of counts) {
      const label = `${combination.join('+')} x${count}`
      log(`memory ${label}`)
      const record = { combination: combination.join('+'), worktrees: count }
      const apps = []
      const started = []
      try {
        for (let i = 0; i < count; i++) {
          const app = copyFresh(base, caseFolder(work, `memory-${combination.join('-')}-${i}`))
          prepareApp(app)
          apps.push(app)
        }
        const loadStart = now()
        for (const app of apps) for (const member of combination) started.push(await startMember(member, app, log))
        record.loadMs = Math.round(now() - loadStart)
        record.workload = []
        for (const entry of started) record.workload.push({ member: entry.member, ...(await entry.workload()) })
        await sleep(2000)
        const rows = processRows()
        record.samples = []
        for (const entry of started) record.samples.push({ root: apps.indexOf(entry.root), ...(await entry.sample(rows)) })
        record.processes = record.samples.reduce((sum, s) => sum + s.processes, 0)
        record.megabytes = record.samples.reduce((sum, s) => sum + s.megabytes, 0)
        record.servers = record.samples.reduce((sum, s) => sum + s.servers.filter((x) => x.name !== 'daemon').length, 0)
      } catch (error) {
        record.error = String(error.message ?? error).slice(0, 600)
      } finally {
        for (const entry of started) await entry.stop().catch(() => {})
        for (const app of apps) removeApp(app)
      }
      out.push(record)
    }
  }
  return out
}

