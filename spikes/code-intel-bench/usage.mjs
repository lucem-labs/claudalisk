import { RUN_CAP_USD } from './ledger.mjs'

const SUBAGENT_TOOLS = new Set(['Agent', 'Task'])

export function parseStream(text) {
  const events = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      continue
    }
  }
  const subagents = new Set()
  for (const event of events) {
    if (event.type !== 'assistant') continue
    for (const block of event.message?.content ?? []) {
      if (block.type === 'tool_use' && SUBAGENT_TOOLS.has(block.name)) subagents.add(block.id ?? `${subagents.size}`)
    }
  }
  const result = events.findLast((event) => event.type === 'result')
  return { events: events.length, result, subagents: subagents.size }
}

export function modelUsage(result) {
  const usage = {}
  for (const [model, entry] of Object.entries(result?.modelUsage ?? {})) {
    usage[model] = {
      input: entry.inputTokens ?? 0,
      output: entry.outputTokens ?? 0,
      cacheRead: entry.cacheReadInputTokens ?? 0,
      cacheCreation: entry.cacheCreationInputTokens ?? 0,
      costUsd: entry.costUSD ?? 0,
    }
  }
  return usage
}

export function sumUsage(usage) {
  const total = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  for (const entry of Object.values(usage)) {
    for (const key of Object.keys(total)) total[key] += entry[key]
  }
  return total
}

export function summarizeRun(parsed, wallMs, exit) {
  const { result } = parsed
  if (!result) {
    return { isError: true, subtype: exit?.timedOut ? 'timeout' : 'no_result', costUsd: RUN_CAP_USD, costEstimated: true, turns: 0, subagents: parsed.subagents, wallMs, models: {} }
  }
  return {
    isError: Boolean(result.is_error),
    subtype: result.subtype ?? 'unknown',
    costUsd: result.total_cost_usd ?? 0,
    turns: result.num_turns ?? 0,
    subagents: parsed.subagents,
    wallMs,
    models: modelUsage(result),
  }
}

export const completed = (summary) => !summary.isError && summary.subtype === 'success'
