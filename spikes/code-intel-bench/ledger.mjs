import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const RUN_CAP_USD = 3
export const EPIC_CAP_USD = 150
export const LEDGER_ENV = 'CODE_INTEL_BENCH_LEDGER'
const LOCK_STALE_MS = 60_000
const LOCK_WAIT_MS = 30_000

const round = (value) => Math.round(value * 1e6) / 1e6

export function defaultLedgerPath(env = process.env, home = homedir()) {
  return env[LEDGER_ENV] || join(home, '.claudalisk', 'code-intel-bench', 'ledger.json')
}

export function emptyLedger() {
  return { capUsd: EPIC_CAP_USD, runCapUsd: RUN_CAP_USD, spentUsd: 0, runs: [] }
}

export function readLedger(file) {
  if (!existsSync(file)) return emptyLedger()
  return { ...emptyLedger(), ...JSON.parse(readFileSync(file, 'utf8')) }
}

export function writeLedger(file, ledger) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`)
  renameSync(temporary, file)
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function withLock(file, change) {
  mkdirSync(dirname(file), { recursive: true })
  const lock = `${file}.lock`
  const deadline = Date.now() + LOCK_WAIT_MS
  let handle
  while (handle === undefined) {
    try {
      handle = openSync(lock, 'wx')
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true })
      } catch {}
      if (Date.now() > deadline) throw new Error(`The ledger ${file} is locked by another run; remove ${lock} if no run is going.`)
      pause(50)
    }
  }
  try {
    const next = change(readLedger(file))
    writeLedger(file, next)
    return next
  } finally {
    closeSync(handle)
    rmSync(lock, { force: true })
  }
}

export function room(ledger, runCap = RUN_CAP_USD) {
  return round(ledger.capUsd - ledger.spentUsd - runCap)
}

export function assertRoom(ledger, runCap = RUN_CAP_USD) {
  if (room(ledger, runCap) < 0) {
    throw new Error(`Refusing to start a run: $${ledger.spentUsd.toFixed(2)} is spent and a run may cost up to $${runCap.toFixed(2)}, which would cross the $${ledger.capUsd.toFixed(2)} budget.`)
  }
}

export function addRun(ledger, { arm, model, task, repeat, file, costUsd, at, ...rest }) {
  return {
    ...ledger,
    spentUsd: round(ledger.spentUsd + costUsd),
    runs: [...ledger.runs, { arm, model, task, repeat, file, costUsd: round(costUsd), at, ...rest }],
  }
}

export function reserveRun(file, { arm, model, task, repeat, at }, runCap = RUN_CAP_USD) {
  const id = `${arm}/${model}/${task}-${repeat}/${at}/${process.pid}`
  withLock(file, (ledger) => {
    assertRoom(ledger, runCap)
    return addRun(ledger, { arm, model, task, repeat, file: null, costUsd: runCap, at, reserved: id })
  })
  return id
}

export function settleRun(file, id, { file: recordFile, costUsd, at }) {
  return withLock(file, (ledger) => {
    const index = ledger.runs.findIndex((entry) => entry.reserved === id)
    if (index < 0) throw new Error(`The ledger ${file} has no reservation ${id}.`)
    const { reserved, ...entry } = ledger.runs[index]
    const runs = [...ledger.runs]
    runs[index] = { ...entry, file: recordFile, costUsd: round(costUsd), at }
    return { ...ledger, spentUsd: round(ledger.spentUsd - entry.costUsd + costUsd), runs }
  })
}

const entryKey = (entry) => entry.reserved ?? (entry.file ? `file:${entry.file}` : `${entry.arm}/${entry.model}/${entry.task}-${entry.repeat}/${entry.at}`)

export function mergeLedgers(target, sources) {
  const seen = new Set(target.runs.map(entryKey))
  let merged = target
  for (const source of sources) {
    for (const entry of source.runs) {
      const key = entryKey(entry)
      if (seen.has(key)) continue
      seen.add(key)
      merged = addRun(merged, entry)
    }
  }
  return merged
}

export function spentByArm(ledger) {
  const totals = {}
  for (const entry of ledger.runs) totals[entry.arm] = round((totals[entry.arm] ?? 0) + entry.costUsd)
  return totals
}
