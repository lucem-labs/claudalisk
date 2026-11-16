#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { armForModel, armsRoot, loadArm } from './arms.mjs'
import { benchRoot } from './lib.mjs'
import { defaultLedgerPath, mergeLedgers, readLedger, withLock } from './ledger.mjs'
import { loadPack, preparePackFixture } from './pack.mjs'
import { renderReport } from './report.mjs'
import { describePlan, plan, readResults, runAll } from './runner.mjs'
import { parseTaskList, taskIds } from './tasks.mjs'

export const resultsRoot = join(benchRoot, 'results')

const USAGE = `Usage: node bench.mjs run --arm <name> [--tasks T1,T2] [--model <id>] [--runs 3] [--dry-run] [--keep] [--pack <folder>]
       node bench.mjs report --arm <name> [--model <id>] [--against baseline] [--pack <folder>]
       node bench.mjs ledger [--merge <ledger.json>,<ledger.json>]`

export function parseCommand(argv) {
  const [command, ...rest] = argv
  const { values } = parseArgs({
    args: rest,
    options: {
      arm: { type: 'string' },
      model: { type: 'string' },
      tasks: { type: 'string' },
      runs: { type: 'string', default: '3' },
      against: { type: 'string' },
      merge: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      keep: { type: 'boolean', default: false },
      pack: { type: 'string' },
    },
  })
  if (command === 'ledger') return { command, merge: values.merge ? values.merge.split(',').filter(Boolean) : [] }
  if (!['run', 'report'].includes(command) || !values.arm) throw new Error(USAGE)
  const runs = Number(values.runs)
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs needs a whole number of at least 1')
  return { command, arm: values.arm, model: values.model, tasks: values.tasks, runs, against: values.against, dryRun: values['dry-run'], keep: values.keep, ...(values.pack ? { pack: values.pack } : {}) }
}

export async function main(argv, { resultsDir = resultsRoot, ledgerPath = defaultLedgerPath(), log = console.log, exec, checkRun, fixture, armsDir = armsRoot } = {}) {
  const options = parseCommand(argv)
  if (options.command === 'ledger') {
    const ledger = options.merge.length ? withLock(ledgerPath, (current) => mergeLedgers(current, options.merge.map(readLedger))) : readLedger(ledgerPath)
    log(`Ledger ${ledgerPath}: ${ledger.spentUsd.toFixed(2)} spent of ${ledger.capUsd.toFixed(2)} over ${ledger.runs.length} runs.`)
    return
  }
  const pack = options.pack ? loadPack(options.pack) : null
  const results = pack ? pack.resultsFolder : resultsDir
  const arm = options.command === 'report' && !existsSync(join(armsDir, options.arm, 'arm.json')) && existsSync(join(results, options.arm)) ? { name: options.arm, models: readdirSync(join(results, options.arm)) } : loadArm(options.arm, armsDir)
  const models = options.model ? [armForModel(arm, options.model).model] : arm.models
  const tasksFolder = pack ? pack.tasksFolder : undefined
  if (options.command === 'report') {
    const tasks = taskIds(tasksFolder)
    const sections = models.map((model) => {
      const baselineRecords = options.against ? readResults(results, options.against, model) : []
      return renderReport({ armName: arm.name, model, records: readResults(results, arm.name, model), tasks, against: options.against, baselineRecords })
    })
    log(sections.join('\n\n'))
    return
  }
  const tasks = parseTaskList(options.tasks, tasksFolder)
  if (options.dryRun) {
    for (const model of models) {
      log(describePlan({ arm: armForModel(arm, model), steps: plan({ tasks, runs: options.runs, resultsDir: results, arm: arm.name, model }), ledger: readLedger(ledgerPath), pack: pack?.id }))
    }
    return
  }
  const prepared = pack && !fixture ? await preparePackFixture(pack, { log }) : fixture
  for (const model of models) {
    await runAll({ arm: armForModel(arm, model), tasks, runs: options.runs, resultsDir: results, ledgerPath, keep: options.keep, exec, checkRun, log, tasksFolder, pack: pack?.id, ...(prepared ? { fixture: prepared } : {}) })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(`x ${error.message}`)
    process.exit(1)
  }
}
