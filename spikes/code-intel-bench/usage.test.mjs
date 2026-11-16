import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { benchRoot } from './lib.mjs'
import { completed, parseStream, summarizeRun, sumUsage } from './usage.mjs'

const stream = (name) => readFileSync(join(benchRoot, 'test', 'streams', `${name}.jsonl`), 'utf8')

test('the final result event carries the cost, the turns and the usage of each model', () => {
  const summary = summarizeRun(parseStream(stream('success')), 4200)

  assert.equal(summary.costUsd, 0.5)
  assert.equal(summary.turns, 7)
  assert.equal(summary.wallMs, 4200)
  assert.equal(summary.isError, false)
  assert.equal(summary.subtype, 'success')
  assert.deepEqual(summary.models['claude-sonnet-5-5'], { input: 1000, output: 200, cacheRead: 5000, cacheCreation: 300, costUsd: 0.4 })
  assert.deepEqual(sumUsage(summary.models), { input: 1100, output: 220, cacheRead: 5700, cacheCreation: 330 })
  assert.equal(completed(summary), true)
})

test('every Agent or Task tool use counts as one subagent, and a repeated block counts once', () => {
  assert.equal(parseStream(stream('success')).subagents, 2)
  assert.equal(parseStream(stream('budget')).subagents, 1)
})

test('a run that stops on its budget is an error that keeps its cost', () => {
  const summary = summarizeRun(parseStream(stream('budget')), 1000)

  assert.equal(summary.isError, true)
  assert.equal(summary.subtype, 'error_max_budget_usd')
  assert.equal(summary.costUsd, 3.02)
  assert.equal(completed(summary), false)
})

test('a stream with no result is an error charged the run cap as an estimate', () => {
  const summary = summarizeRun(parseStream(stream('crash')), 10, { timedOut: false })

  assert.equal(summary.isError, true)
  assert.equal(summary.subtype, 'no_result')
  assert.equal(summary.costUsd, 3)
  assert.equal(summary.costEstimated, true)
  assert.equal(summarizeRun(parseStream(''), 10, { timedOut: true }).subtype, 'timeout')
})

test('lines that are not JSON are skipped', () => {
  const parsed = parseStream('warning: something\n{"type":"result","subtype":"success","total_cost_usd":1}\n{broken')

  assert.equal(parsed.events, 1)
  assert.equal(parsed.result.total_cost_usd, 1)
})
