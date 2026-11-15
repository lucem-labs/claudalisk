import { spawnSync } from 'node:child_process'

export function treeOf(rows, rootPid) {
  const children = new Map()
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, [])
    children.get(row.ppid).push(row)
  }
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const members = []
  const queue = [rootPid]
  const seen = new Set()
  while (queue.length) {
    const pid = queue.shift()
    if (seen.has(pid)) continue
    seen.add(pid)
    if (byPid.has(pid)) members.push(byPid.get(pid))
    for (const child of children.get(pid) ?? []) queue.push(child.pid)
  }
  return members
}

export function parsePs(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((parts) => parts.length === 3 && parts.every(Number.isFinite))
    .map(([pid, ppid, rssKb]) => ({ pid, ppid, bytes: rssKb * 1024 }))
}

export function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().split(','))
    .filter((parts) => parts.length === 3 && parts.every((p) => /^\d+$/.test(p)))
    .map(([pid, ppid, bytes]) => ({ pid: Number(pid), ppid: Number(ppid), bytes: Number(bytes) }))
}

export function processRows() {
  if (process.platform === 'win32') {
    const script = "Get-CimInstance Win32_Process | ForEach-Object { '{0},{1},{2}' -f $_.ProcessId, $_.ParentProcessId, $_.WorkingSetSize }"
    const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    return parseCsv(result.stdout ?? '')
  }
  const result = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return parsePs(result.stdout ?? '')
}

export function treeMemory(rootPid, rows = processRows()) {
  const members = treeOf(rows, rootPid)
  return { processes: members.length, megabytes: Math.round(members.reduce((sum, row) => sum + row.bytes, 0) / (1024 * 1024)) }
}

export function percentile(values, fraction) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

export const median = (values) => percentile(values, 0.5)
