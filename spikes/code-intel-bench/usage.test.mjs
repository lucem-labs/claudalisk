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

test('tool uses whose name matches the pattern, or whose Bash command does, are counted once each', () => {
  const use = (id, name, input = {}) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
  const text = [
    use('1', 'mcp__plugin_claudalisk_code-intel-b__find'),
    use('1', 'mcp__plugin_claudalisk_code-intel-b__find'),
    use('2', 'Bash', { command: 'node /s/spikes/code-intel/b/cli.mjs references X' }),
    use('3', 'Bash', { command: 'npm test' }),
    use('4', 'Read', { file_path: '/s/spikes/code-intel/b/cli.mjs' }),
  ].join('\n')

  assert.equal(parseStream(text, 'code-intel').codeIntelCalls, 2)
  assert.equal(parseStream(text).codeIntelCalls, undefined)
  assert.equal(summarizeRun(parseStream(text, 'code-intel'), 1).codeIntelCalls, 2)
  assert.equal(summarizeRun(parseStream('', 'code-intel'), 1).codeIntelCalls, 0)
  assert.equal('codeIntelCalls' in summarizeRun(parseStream(text), 1), false)
})

test('tool uses inside subagent messages count, in the mcp tool names and in Bash commands', () => {
  const event = (parent, id, name, input = {}) => JSON.stringify({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name, input }] } })
  const text = [
    event(null, 'agent-1', 'Agent', { description: 'scout' }),
    event('agent-1', 's1', 'mcp__plugin_claudalisk_code-intel-b__references', { name: 'A.B' }),
    event('agent-1', 's2', 'Bash', { command: 'node C:/tmp/plugin/spikes/code-intel/b/cli.mjs references A.B' }),
    event('agent-1', 's3', 'Bash', { command: 'dotnet test' }),
  ].join('\n')

  const parsed = parseStream(text, '^mcp__.*code-intel-b|spikes/code-intel/b/cli.mjs')

  assert.equal(parsed.codeIntelCalls, 2)
  assert.equal(parsed.subagents, 1)
})

test('a code-intel CLI call through the PowerShell tool counts like one through Bash', () => {
  const use = (id, name, command) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: { command } }] } })
  const text = [use('1', 'Bash', 'node x/b/cli.mjs find A'), use('2', 'PowerShell', 'node x/b/cli.mjs find B'), use('3', 'PowerShell', 'Get-ChildItem')].join('\n')
  assert.equal(parseStream(text, 'b/cli\.mjs').codeIntelCalls, 2)
})
