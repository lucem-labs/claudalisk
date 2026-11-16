import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { main, parseCommand } from './bench.mjs'
import { taskIds } from './tasks.mjs'
import { emptyLedger, writeLedger } from './ledger.mjs'
import { renderArm, renderReport, repeatsOf, stats, table } from './report.mjs'

const TASKS = ['T1', 'T2']

function record(task, run, { cost = 1, accepted = true, turns = 10, cacheRead = 1000, subagents = 1, wallMs = 60000 } = {}) {
  return { arm: 'x', task, run, totalCostUsd: cost, accepted, turns, subagents, wallMs, models: { m: { input: 1, output: 1, cacheRead, cacheCreation: 1, costUsd: cost } } }
}

test('the statistics are the mean and the spread', () => {
  assert.deepEqual(stats([1, 2, 6]), { mean: 3, min: 1, max: 6 })
})

test('the table has a row per task with runs, pass rate, mean and spread, and a suite row', () => {
  const records = [
    record('T1', 1, { cost: 1, turns: 10, cacheRead: 1000 }),
    record('T1', 2, { cost: 3, turns: 20, cacheRead: 3000, accepted: false }),
    record('T2', 1, { cost: 2 }),
  ]

  const lines = table(records, TASKS).split('\n')

  assert.equal(lines[0], '| Task | Runs | Passed | Pass rate | Cost mean (min to max) | Turns | Cache read tokens | Subagents | Wall seconds |')
  assert.equal(lines[2], '| T1 | 2 | 1 | 50% | $2.00 ($1.00 to $3.00) | 15 (10 to 20) | 2,000 (1,000 to 3,000) | 1.0 (1.0 to 1.0) | 60 (60 to 60) |')
  assert.equal(lines[3], '| T2 | 1 | 1 | 100% | $2.00 ($2.00 to $2.00) | 10 (10 to 10) | 1,000 (1,000 to 1,000) | 1.0 (1.0 to 1.0) | 60 (60 to 60) |')
  assert.match(lines[4], /^\| Suite \| 3 \| 2 \| 67% \| \$2\.00 \(\$1\.00 to \$3\.00\)/)
})

test('a repeat is one run of every task, and an incomplete pass is left out', () => {
  const records = [record('T1', 1), record('T2', 1, { accepted: false, cost: 3 }), record('T1', 2)]

  const repeats = repeatsOf(records, TASKS)

  assert.equal(repeats.length, 1)
  assert.deepEqual(repeats[0], { repeat: 1, complete: true, runs: 2, costUsd: 4, passed: 1, passedByTask: { T1: 1, T2: 0 } })
})

test('the suite line gives the cost per accepted task of each repeat', () => {
  const records = [record('T1', 1, { cost: 1 }), record('T2', 1, { cost: 3, accepted: false }), record('T1', 2, { accepted: false }), record('T2', 2, { accepted: false })]

  const text = renderReport({ armName: 'x', model: 'm1', records, tasks: TASKS })

  assert.match(text, /repeat 1: \$4\.00 over 1 of 2 runs passed, \$4\.00 per accepted task/)
  assert.match(text, /repeat 2: \$2\.00 over 0 of 2 runs passed, no run passed per accepted task/)
})

test('against a baseline the report prints the verdict of the noise rule', () => {
  const run = (cost, accepted = true) => (number) => TASKS.map((task) => record(task, number, { cost, accepted }))
  const arm = [1, 2, 3].flatMap((number) => run(0.5)(number))
  const baseline = [1, 2, 3].flatMap((number) => run(1)(number))

  const text = renderReport({ armName: 'new', model: 'm1', records: arm, tasks: TASKS, against: 'baseline', baselineRecords: baseline })

  assert.match(text, /## new against baseline/)
  assert.match(text, /Verdict: lowers cost/)
})

test('against an unfinished baseline the verdict says there is not enough data', () => {
  const text = renderReport({ armName: 'new', model: 'm1', records: [record('T1', 1), record('T2', 1)], tasks: TASKS, against: 'baseline', baselineRecords: [] })

  assert.match(text, /Verdict: insufficient data/)
})

test('the command line needs a command and an arm, and whole runs', () => {
  assert.deepEqual(parseCommand(['run', '--arm', 'baseline', '--tasks', 'T1,T2', '--runs', '2', '--dry-run']), { command: 'run', arm: 'baseline', tasks: 'T1,T2', runs: 2, model: undefined, against: undefined, dryRun: true, keep: false })
  assert.throws(() => parseCommand(['run']), /Usage/)
  assert.throws(() => parseCommand(['plan', '--arm', 'baseline']), /Usage/)
  assert.throws(() => parseCommand(['run', '--arm', 'baseline', '--runs', '0']), /whole number/)
})

test('a dry run prints the plan, the worst-case spend and the ledger without calling claude', async () => {
  const base = mkdtempSync(join(tmpdir(), 'bench-cli-'))
  const lines = []
  const calls = []
  try {
    writeLedger(join(base, 'ledger.json'), { ...emptyLedger(), spentUsd: 100 })

    await main(['run', '--arm', 'baseline', '--dry-run'], { resultsDir: base, ledgerPath: join(base, 'ledger.json'), log: (line) => lines.push(line), exec: async () => { calls.push(1) } })

    const text = lines.join('\n')
    assert.match(text, /Arm baseline on claude-sonnet-5-5:/)
    assert.match(text, /Arm baseline on claude-opus-5-5:/)
    assert.match(text, /21 runs, each capped at \$3\.00, so at most \$63\.00/)
    assert.match(text, /T7 repeat 3/)
    assert.match(text, /Ledger: \$100\.00 spent of \$150\.00 over 0 runs; \$50\.00 left\./)
    assert.match(text, /worst case would cross the budget; the runner starts at most 16 of these/)
    assert.deepEqual(calls, [])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the report command reads the results of an arm', async () => {
  const base = mkdtempSync(join(tmpdir(), 'bench-cli-'))
  const lines = []
  try {
    mkdirSync(join(base, 'baseline', 'claude-sonnet-5-5'), { recursive: true })
    writeFileSync(join(base, 'baseline', 'claude-sonnet-5-5', '20260101T000000Z-T1-1.json'), JSON.stringify(record('T1', 1)))

    await main(['report', '--arm', 'baseline'], { resultsDir: base, log: (line) => lines.push(line) })

    assert.match(lines.join('\n'), /\| T1 \| 1 \| 1 \| 100% \|/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the report lists a relabelled arm that has records but no arm folder, and run refuses it', async () => {
  const base = mkdtempSync(join(tmpdir(), 'bench-cli-'))
  const lines = []
  try {
    mkdirSync(join(base, 'b-mcp-idle', 'claude-sonnet-5-5'), { recursive: true })
    writeFileSync(join(base, 'b-mcp-idle', 'claude-sonnet-5-5', '20260101T000000Z-T1-1.json'), JSON.stringify(record('T1', 1)))

    await main(['report', '--arm', 'b-mcp-idle'], { resultsDir: base, log: (line) => lines.push(line) })

    assert.match(lines.join('\n'), /## b-mcp-idle[\s\S]*\| T1 \| 1 \| 1 \| 100% \|/)
    await assert.rejects(main(['run', '--arm', 'b-mcp-idle', '--dry-run'], { resultsDir: base, log: () => {} }), /no arm b-mcp-idle/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('repeats are grouped by their repeat number, not by per-task run numbers', () => {
  const records = [
    { ...record('T1', 1), repeat: 1 },
    { ...record('T2', 1), repeat: 1 },
    { ...record('T1', 2), repeat: 2 },
    { ...record('T2', 5), repeat: 2 },
  ]

  assert.deepEqual(repeatsOf(records, ['T1', 'T2']).map((repeat) => repeat.repeat), [1, 2])
})

test('--model limits a dry run to one model, and an unknown model is refused', async () => {
  const base = mkdtempSync(join(tmpdir(), 'bench-cli-'))
  const lines = []
  try {
    await main(['run', '--arm', 'baseline', '--model', 'claude-opus-5-5', '--dry-run'], { resultsDir: base, ledgerPath: join(base, 'ledger.json'), log: (line) => lines.push(line) })

    const text = lines.join('\n')
    assert.match(text, /Arm baseline on claude-opus-5-5:/)
    assert.doesNotMatch(text, /claude-sonnet-5-5/)
    await assert.rejects(main(['run', '--arm', 'baseline', '--model', 'nope', '--dry-run'], { resultsDir: base, ledgerPath: join(base, 'ledger.json'), log: () => {} }), /no model nope/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the report has one section and one verdict per model, and --model limits it', async () => {
  const base = mkdtempSync(join(tmpdir(), 'bench-cli-'))
  const lines = []
  const put = (arm, model, cost) => {
    mkdirSync(join(base, arm, model), { recursive: true })
    for (const repeat of [1, 2, 3]) {
      for (const task of taskIds()) writeFileSync(join(base, arm, model, `20260101T000000Z-${task}-${repeat}.json`), JSON.stringify({ ...record(task, repeat, { cost }), repeat }))
    }
  }
  try {
    put('baseline', 'claude-sonnet-5-5', 1)
    put('baseline', 'claude-opus-5-5', 1)

    await main(['report', '--arm', 'baseline', '--against', 'baseline'], { resultsDir: base, log: (line) => lines.push(line) })
    const both = lines.join('\n')
    assert.equal(both.match(/^# claude-/gm).length, 2)
    assert.equal(both.match(/^Verdict: /gm).length, 2)

    lines.length = 0
    await main(['report', '--arm', 'baseline', '--model', 'claude-opus-5-5', '--against', 'baseline'], { resultsDir: base, log: (line) => lines.push(line) })
    assert.equal(lines.join('\n').match(/^# claude-/gm).length, 1)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the table gains a code-intel calls column only when a record has the count', () => {
  const record = (task, calls) => ({ task, accepted: true, totalCostUsd: 1, turns: 1, subagents: 0, wallMs: 1000, models: {}, ...(calls === undefined ? {} : { codeIntelCalls: calls }) })

  assert.equal(table([record('T1')], ['T1']).split('\n')[0].includes('Code-intel calls'), false)
  const lines = table([record('T1', 2), record('T1', 4)], ['T1']).split('\n')
  assert.equal(lines[0].endsWith('| Code-intel calls |'), true)
  assert.equal(lines[2].endsWith('| 3.0 (2.0 to 4.0) |'), true)
})

test('the table gains the scout shell column only for records with the guard counts, and warns about unknown agents', () => {
  const record = (task, counts) => ({ task, accepted: true, totalCostUsd: 1, turns: 1, subagents: 0, wallMs: 1000, models: {}, ...(counts ? { scoutBashDecisions: counts } : {}) })

  assert.equal(table([record('T1')], ['T1']).split('\n')[0].includes('Scout Bash'), false)
  const lines = table([record('T1', { allowed: 3, denied: 1, unknownAgent: 0 }), record('T1', { allowed: 2, denied: 0, unknownAgent: 0 })], ['T1']).split('\n')
  assert.equal(lines[0].endsWith('| Scout Bash allowed / denied / unknown agent |'), true)
  assert.equal(lines[2].endsWith('| 5 / 1 / 0 |'), true)
  assert.equal(renderArm('x', [record('T1', { allowed: 1, denied: 0, unknownAgent: 0 })], ['T1']).includes('Warning'), false)
  assert.match(renderArm('x', [record('T1', { allowed: 1, denied: 0, unknownAgent: 2 })], ['T1']), /Warning: 2 shell calls came from an agent whose agent_type was missing/)
})
