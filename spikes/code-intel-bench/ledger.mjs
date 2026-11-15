import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const RUN_CAP_USD = 3
export const EPIC_CAP_USD = 150

const round = (value) => Math.round(value * 1e6) / 1e6

export function emptyLedger() {
  return { capUsd: EPIC_CAP_USD, runCapUsd: RUN_CAP_USD, spentUsd: 0, runs: [] }
}

export function readLedger(file) {
  if (!existsSync(file)) return emptyLedger()
  return { ...emptyLedger(), ...JSON.parse(readFileSync(file, 'utf8')) }
}

export function writeLedger(file, ledger) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`)
  renameSync(temporary, file)
}

export function room(ledger, runCap = RUN_CAP_USD) {
  return round(ledger.capUsd - ledger.spentUsd - runCap)
}

export function assertRoom(ledger, runCap = RUN_CAP_USD) {
  if (room(ledger, runCap) < 0) {
    throw new Error(`Refusing to start a run: $${ledger.spentUsd.toFixed(2)} is spent and a run may cost up to $${runCap.toFixed(2)}, which would cross the $${ledger.capUsd.toFixed(2)} budget.`)
  }
}

export function addRun(ledger, { arm, task, run, file, costUsd, at }) {
  return {
    ...ledger,
    spentUsd: round(ledger.spentUsd + costUsd),
    runs: [...ledger.runs, { arm, task, run, file, costUsd: round(costUsd), at }],
  }
}

export function spentByArm(ledger) {
  const totals = {}
  for (const entry of ledger.runs) totals[entry.arm] = round((totals[entry.arm] ?? 0) + entry.costUsd)
  return totals
}
