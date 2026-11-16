import { spawnSync } from 'node:child_process'
import { readlinkSync } from 'node:fs'

export const SAMPLE_INTERVAL_MS = 3000
export const HIDDEN_CHECK_ENV = { MSBUILDDISABLENODEREUSE: '1', DOTNET_CLI_USE_MSBUILD_SERVER: '0', UseSharedCompilation: 'false' }

const BUILD_NAMES = new Set(['dotnet', 'msbuild', 'vbcscompiler'])
const POSIX_LINE = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/

export function baseName(value) {
  return String(value ?? '').trim().replace(/^"/, '').split(/\s/)[0].split(/[\\/]/).pop().replace(/\.exe$/i, '').replace(/"$/, '')
}

export function isBuildProcess(name) {
  return BUILD_NAMES.has(baseName(name).toLowerCase())
}

export function parsePosixList(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const match = POSIX_LINE.exec(line)
    if (!match) continue
    const commandLine = match[4].trim()
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), name: baseName(commandLine), commandLine, startedAt: match[3].replace(/\s+/g, ' ') })
  }
  return rows
}

export function parseWindowsList(text) {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed)
  return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
    pid: Number(row.pid),
    ppid: Number(row.ppid),
    name: String(row.name ?? ''),
    commandLine: String(row.commandLine ?? ''),
    startedAt: String(row.startedAt ?? ''),
  }))
}

const WINDOWS_QUERY = "Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; name = $_.Name; commandLine = $_.CommandLine; startedAt = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { '' }) } } | ConvertTo-Json -Compress"

function systemRun(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  return result.status === 0 ? result.stdout : ''
}

export function readCwd(pid, platform = process.platform, readlink = readlinkSync) {
  if (platform !== 'linux') return undefined
  try {
    return readlink(`/proc/${pid}/cwd`)
  } catch {
    return undefined
  }
}

export function listProcesses({ platform = process.platform, run = systemRun, readlink } = {}) {
  if (platform === 'win32') return parseWindowsList(run('powershell', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY]))
  return parsePosixList(run('ps', ['-eo', 'pid=,ppid=,lstart=,args='])).map((row) => {
    const cwd = readCwd(row.pid, platform, readlink)
    return cwd === undefined ? row : { ...row, cwd }
  })
}

export function descendants(snapshot, remembered, roots = []) {
  const found = new Map(remembered)
  const byPid = new Map(snapshot.map((row) => [row.pid, row]))
  for (const root of roots) {
    const row = byPid.get(root)
    if (row && !found.has(root)) found.set(root, row.startedAt)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const row of snapshot) {
      if (found.has(row.pid) || !found.has(row.ppid)) continue
      const parent = byPid.get(row.ppid)
      if (parent && parent.startedAt !== found.get(row.ppid)) continue
      found.set(row.pid, row.startedAt)
      grew = true
    }
  }
  return found
}

function normalise(value, windows) {
  const text = String(value ?? '').replace(/\\/g, '/')
  return windows ? text.toLowerCase() : text
}

export function insideAny(text, folders, platform = process.platform) {
  const windows = platform === 'win32'
  const haystack = normalise(text, windows)
  return folders.some((folder) => {
    const needle = normalise(folder, windows).replace(/\/+$/, '')
    if (!needle.length) return false
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
      const next = haystack[at + needle.length]
      if (next === undefined || next === '/' || /[\s"']/.test(next)) return true
    }
    return false
  })
}

export function selectLeftovers({ snapshot, remembered, folders, platform = process.platform, self = process.pid }) {
  return snapshot.filter((row) => {
    if (row.pid === self || !isBuildProcess(row.name)) return false
    if (remembered.get(row.pid) === row.startedAt) return true
    return insideAny(row.commandLine, folders, platform) || insideAny(row.cwd, folders, platform)
  })
}

export function subtree(snapshot, pid) {
  const order = []
  const walk = (current) => {
    for (const row of snapshot) if (row.ppid === current && row.pid !== current) walk(row.pid)
    order.push(current)
  }
  walk(pid)
  return order
}

export function killPid(pid, snapshot, { platform = process.platform, spawn = spawnSync, kill = process.kill } = {}) {
  try {
    if (platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    else for (const target of subtree(snapshot, pid)) kill(target, 'SIGKILL')
  } catch {
    return
  }
}

export function createWatcher({ list = listProcesses, intervalMs = SAMPLE_INTERVAL_MS } = {}) {
  let remembered = new Map()
  const roots = new Set()
  let timer
  const sample = () => {
    const snapshot = list()
    remembered = descendants(snapshot, remembered, [...roots])
    return snapshot
  }
  return {
    track(pid) {
      if (pid) roots.add(pid)
    },
    start() {
      timer = setInterval(() => {
        try {
          sample()
        } catch {
          return
        }
      }, intervalMs)
      timer.unref()
    },
    sample,
    remembered: () => remembered,
    stop() {
      clearInterval(timer)
    },
  }
}

export function sweep({ watcher, folders, platform = process.platform, kill = killPid, self = process.pid }) {
  watcher.stop()
  let snapshot = []
  try {
    snapshot = watcher.sample()
  } catch {
    snapshot = []
  }
  const victims = selectLeftovers({ snapshot, remembered: watcher.remembered(), folders, platform, self })
  const names = []
  for (const victim of victims) {
    kill(victim.pid, snapshot, { platform })
    names.push(baseName(victim.name).toLowerCase())
  }
  return { killed: victims.length, names }
}
