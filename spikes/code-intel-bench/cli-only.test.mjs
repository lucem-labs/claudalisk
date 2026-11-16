import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scoutBashDecisions } from './hooklog.mjs'
import { allowedCommand, decide, run } from './arm-hooks/cli-only.mjs'

const cli = '/stage/plugin/spikes/code-intel/b/cli.mjs'
const scout = (command, extra = {}) => ({ tool_name: 'Bash', agent_id: 'a1', agent_type: 'claudalisk:scout', tool_input: { command }, ...extra })
const decision = (input) => decide(input, { cli }).decision

test('the scout may run the staged cli, quoted or not, with any arguments', () => {
  assert.equal(decision(scout(`node "${cli}" find Orders.Order`)), 'allowed')
  assert.equal(decision(scout(`node ${cli} references "A.B C" x`)), 'allowed')
  assert.equal(decision(scout(`node '${cli}' stop`)), 'allowed')
  assert.equal(decision(scout(`  node "${cli}" find X  `)), 'allowed')
  assert.equal(decision(scout(`node "${cli}" run "const m = await ci.matches('A'); print(m.length)"`)), 'allowed')
  assert.equal(decision(scout(`node "${cli}" find "a;b|c>d"`)), 'allowed')
  assert.equal(decision(scout(`node "${cli}" find 'x && y'`)), 'allowed')
  assert.equal(decision(scout(`node "${cli}" find X`, { agent_type: 'scout', tool_name: 'PowerShell' })), 'allowed')
})

test('the scout may not run the edit operations, nor a snippet that calls them', () => {
  for (const command of [`node "${cli}" rename Orders.Order Sale`, `node "${cli}" replaceBody X "{}"`, `node "${cli}" run "await ci.rename('A', 'B')"`]) {
    const result = decide(scout(command), { cli })
    assert.equal(result.decision, 'denied', command)
    assert.match(result.reason, /read-only/)
  }
  assert.equal(decision(scout(`node "${cli}" run "await ci['rename']('A', 'B')"`)), 'denied')
})

test('a read of a symbol whose name contains an edit operation is allowed', () => {
  for (const command of [`node "${cli}" references RenameOrderHandler`, `node "${cli}" find OrderRenamed`, `node "${cli}" run "print(await ci.find('replaceBodyText'))"`]) {
    assert.equal(decision(scout(command)), 'allowed', command)
  }
})

test('the staged path matches with either slash', () => {
  assert.equal(allowedCommand('node "C:\\stage\\plugin\\cli.mjs" find X', 'C:/stage/plugin/cli.mjs'), true)
  assert.equal(allowedCommand('node "C:/stage/plugin/cli.mjs" find X', 'C:\\stage\\plugin\\cli.mjs'), true)
})

test('anything else from the scout is denied with a reason that names the cli', () => {
  const denied = ['cat x', 'ls', 'node other.mjs find X', `node "${cli}x" find X`, `cd /x && node "${cli}" find X`, 'grep -r foo .', 'node', `node -e "1" "${cli}"`, '']
  for (const command of denied) assert.equal(decision(scout(command)), 'denied', command)
  assert.match(decide(scout('cat x'), { cli }).reason, /Only the code-intel CLI/)
})

test('shell metacharacters outside quotes deny an otherwise allowed command', () => {
  const chained = [
    `node "${cli}" find X; cat y`,
    `node "${cli}" find X && cat y`,
    `node "${cli}" find X | head`,
    `node "${cli}" find X > out`,
    `node "${cli}" find X < in`,
    `node "${cli}" find $(cat y)`,
    `node "${cli}" find "$(cat y)"`,
    `node "${cli}" find \`cat y\``,
    `node "${cli}" find "\`cat y\`"`,
    `node "${cli}" find X\ncat y`,
    `node "${cli}" find X\r\ncat y`,
    `node "${cli}" find X &`,
    `node "${cli}" find "unterminated`,
  ]
  for (const command of chained) assert.equal(decision(scout(command)), 'denied', JSON.stringify(command))
})

test('a call that is not from the scout is left alone', () => {
  assert.equal(decision({ tool_name: 'Bash', agent_id: 'a2', agent_type: 'claudalisk:implementer', tool_input: { command: 'cat x' } }), 'ignored')
  assert.equal(decision({ tool_name: 'Bash', agent_id: 'a2', agent_type: 'scouting', tool_input: { command: 'cat x' } }), 'ignored')
  assert.equal(decision({ tool_name: 'Bash', agent_type: 'general-purpose', agent_id: 'a3', tool_input: { command: 'cat x' } }), 'ignored')
  assert.equal(decision({ tool_name: 'Bash', tool_input: { command: 'cat x' } }), 'ignored')
  assert.equal(decision({ tool_name: 'Read', agent_id: 'a1', agent_type: 'scout', tool_input: { file_path: 'x' } }), 'ignored')
})

test('a shell call from a subagent without agent_type is not treated as the scout but is counted', () => {
  assert.equal(decision({ tool_name: 'Bash', agent_id: 'a4', tool_input: { command: 'cat x' } }), 'unknownAgent')
  assert.equal(decision({ tool_name: 'PowerShell', agent_id: 'a4', tool_input: { command: 'cat x' } }), 'unknownAgent')
})

test('the hook writes a deny decision only for a denial, and one log line per scout or unknown call', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cli-only-'))
  const log = join(folder, 'decisions.jsonl')
  const at = () => new Date('2026-01-01T00:00:00Z')
  try {
    const call = (input) => run(JSON.stringify(input), { cli, log, now: at })
    assert.equal(call(scout(`node "${cli}" find X`)), null)
    assert.deepEqual(call(scout('cat x')), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: decide(scout('cat x'), { cli }).reason } })
    assert.equal(call({ tool_name: 'Bash', agent_id: 'a4', tool_input: { command: 'cat x' } }), null)
    assert.equal(call({ tool_name: 'Bash', tool_input: { command: 'cat x' } }), null)
    assert.equal(call({ tool_name: 'Bash', agent_type: 'claudalisk:implementer', agent_id: 'a2', tool_input: { command: 'cat x' } }), null)

    const lines = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(lines.map((line) => line.decision), ['allowed', 'denied', 'unknownAgent'])
    assert.deepEqual(lines[0], { at: '2026-01-01T00:00:00.000Z', tool: 'Bash', agentType: 'claudalisk:scout', agentId: 'a1', decision: 'allowed' })
    assert.deepEqual(scoutBashDecisions(log), { allowed: 1, denied: 1, unknownAgent: 1 })
    assert.equal(run(JSON.stringify(scout('cat x')), { cli, log: undefined }).hookSpecificOutput.permissionDecision, 'deny')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('a missing or damaged log counts as no decisions', () => {
  const folder = mkdtempSync(join(tmpdir(), 'cli-only-log-'))
  try {
    assert.deepEqual(scoutBashDecisions(join(folder, 'absent.jsonl')), { allowed: 0, denied: 0, unknownAgent: 0 })
    assert.deepEqual(scoutBashDecisions(undefined), { allowed: 0, denied: 0, unknownAgent: 0 })
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
