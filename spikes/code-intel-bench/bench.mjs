#!/usr/bin/env node
import { join } from 'node:path'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { loadArm } from './arms.mjs'
import { benchRoot, ledgerFile } from './lib.mjs'
import { readLedger } from './ledger.mjs'
import { renderReport } from './report.mjs'
import { describePlan, plan, readResults, runAll } from './runner.mjs'
import { parseTaskList, taskIds } from './tasks.mjs'

export const resultsRoot = join(benchRoot, 'results')

const USAGE = `Usage: node bench.mjs run --arm <name> [--tasks T1,T2] [--runs 3] [--dry-run] [--keep]
       node bench.mjs report --arm <name> [--against baseline]`

export function parseCommand(argv) {
  const [command, ...rest] = argv
  const { values } = parseArgs({
    args: rest,
    options: {
      arm: { type: 'string' },
      tasks: { type: 'string' },
      runs: { type: 'string', default: '3' },
      against: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      keep: { type: 'boolean', default: false },
    },
  })
  if (!['run', 'report'].includes(command) || !values.arm) throw new Error(USAGE)
  const runs = Number(values.runs)
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs needs a whole number of at least 1')
  return { command, arm: values.arm, tasks: values.tasks, runs, against: values.against, dryRun: values['dry-run'], keep: values.keep }
}

export async function main(argv, { resultsDir = resultsRoot, ledgerPath = ledgerFile, log = console.log, exec, checkRun, fixture } = {}) {
  const options = parseCommand(argv)
  const arm = loadArm(options.arm)
  if (options.command === 'report') {
    const tasks = taskIds()
    const baselineRecords = options.against ? readResults(resultsDir, options.against) : []
    log(renderReport({ armName: arm.name, records: readResults(resultsDir, arm.name), tasks, against: options.against, baselineRecords }))
    return
  }
  const tasks = parseTaskList(options.tasks)
  if (options.dryRun) {
    log(describePlan({ arm, steps: plan({ tasks, runs: options.runs, resultsDir, arm: arm.name }), ledger: readLedger(ledgerPath) }))
    return
  }
  await runAll({ arm, tasks, runs: options.runs, resultsDir, ledgerPath, keep: options.keep, exec, checkRun, log, ...(fixture ? { fixture } : {}) })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(`x ${error.message}`)
    process.exit(1)
  }
}
