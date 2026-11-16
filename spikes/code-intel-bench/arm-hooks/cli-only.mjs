#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHELLS = new Set(['Bash', 'PowerShell'])
const SCOUT = /^(?:[^:\s]+:)?scout$/
const REASON = 'Only the code-intel CLI is available to this agent: run exactly `node <cli path> <operation> <arguments>` as one command, with no pipes, redirects, chaining or substitution, and use the Read tool for files.'
const EDIT_REASON = 'This agent is read-only: the code-intel edit operations rename and replaceBody are not available to it.'
const EDIT_OPERATION = /^\s*["']?(?:rename|replaceBody)["']?(?:\s|$)|\bci\s*\.\s*(?:rename|replaceBody)\b|\bci\s*\[\s*["'`](?:rename|replaceBody)/

const normal = (path) => {
  const slashed = path.replaceAll('\\', '/')
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

const LEADING = /^node\s+(?:"([^"]*)"|'([^']*)'|(\S+))(?=\s|$)/

function leadingPath(command) {
  const match = LEADING.exec(command)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

const operationText = (command) => command.slice(LEADING.exec(command)?.[0].length ?? 0)

function metacharacterOutsideQuotes(command) {
  let quote
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (char === '\n' || char === '\r') return true
    if (char === '`' && quote !== "'") return true
    if (char === '$' && command[index + 1] === '(' && quote !== "'") return true
    if (quote) {
      if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (';&|<>'.includes(char)) {
      return true
    }
  }
  return quote !== undefined
}

export function allowedCommand(command, cli) {
  const text = String(command ?? '').trim()
  const path = leadingPath(text)
  return path !== undefined && normal(path) === normal(cli) && !metacharacterOutsideQuotes(text)
}

export function decide(input, { cli }) {
  if (!SHELLS.has(input?.tool_name)) return { decision: 'ignored' }
  const type = input.agent_type
  if (!type) return input.agent_id ? { decision: 'unknownAgent' } : { decision: 'ignored' }
  if (!SCOUT.test(type)) return { decision: 'ignored' }
  const command = input.tool_input?.command
  if (!allowedCommand(command, cli)) return { decision: 'denied', reason: REASON }
  const text = String(command).trim()
  if (EDIT_OPERATION.test(operationText(text))) return { decision: 'denied', reason: EDIT_REASON }
  return { decision: 'allowed' }
}

const LOGGED = new Set(['allowed', 'denied', 'unknownAgent'])

export function run(text, { cli, log = process.env.CODE_INTEL_BENCH_HOOK_LOG, now = () => new Date() }) {
  const input = JSON.parse(text)
  const result = decide(input, { cli })
  if (log && LOGGED.has(result.decision)) {
    const line = { at: now().toISOString(), tool: input.tool_name, agentType: input.agent_type ?? null, agentId: input.agent_id ?? null, decision: result.decision }
    appendFileSync(log, `${JSON.stringify(line)}\n`)
  }
  if (result.decision !== 'denied') return null
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.reason } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = run(readFileSync(0, 'utf8'), { cli: process.argv[2] ?? '' })
    if (output) process.stdout.write(JSON.stringify(output))
  } catch {
    process.exit(0)
  }
}
