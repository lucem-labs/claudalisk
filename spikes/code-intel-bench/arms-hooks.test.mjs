import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { test } from 'node:test'
import { applyAgents, applyHooks, loadArm, mcpToolNames, stagePlugin } from './arms.mjs'

const ROOT = '$' + '{CLAUDE_PLUGIN_ROOT}'

function write(file, text = 'x') {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

const server = (name, ...args) => [name, { command: 'node', args: [`${ROOT}/spikes/code-intel/${name}/mcp.mjs`, ...args] }]

async function stagedArm(name) {
  const arm = loadArm(name)
  const base = mkdtempSync(join(tmpdir(), 'arm-stage-'))
  const plugin = stagePlugin(arm.pluginDir, join(base, 'plugin'), { include: arm.include, overlay: arm.overlay })
  return { arm, base, plugin }
}

test('a scout gets only read-only mcp tools, and the c scout gets the read-only server', async () => {
  for (const name of ['a-mcp', 'b-mcp', 'c-mcp']) {
    const { arm, base, plugin } = await stagedArm(name)
    try {
      const [scout, implementer] = await applyAgents(plugin, arm.agents)
      assert.equal(scout.addedTools.length > 0, true, name)
      assert.equal(scout.addedTools.some((tool) => /__(rename|replaceBody)$/.test(tool)), false, name)
      for (const tool of [...scout.addedTools, ...implementer.addedTools]) assert.equal(new RegExp(arm.toolPattern).test(tool), true, tool)
      if (name === 'c-mcp') {
        assert.deepEqual(scout.addedTools, ['mcp__plugin_claudalisk_code-intel-c-read__run'])
        assert.deepEqual(implementer.addedTools, ['mcp__plugin_claudalisk_code-intel-c__run'])
      } else {
        assert.equal(implementer.addedTools.some((tool) => tool.endsWith('__rename')), true, name)
      }
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  }
})

test('the scout note of every arm names no edit operation and the implementer note does', async () => {
  for (const name of ['a-mcp', 'b-mcp', 'c-mcp', 'a-cli', 'b-cli', 'c-cli']) {
    const { arm, base, plugin } = await stagedArm(name)
    try {
      await applyAgents(plugin, arm.agents)
      const section = (agent) => {
        const text = readFileSync(join(plugin, 'agents', `${agent}.md`), 'utf8')
        return text.slice(text.indexOf('## Code intelligence'))
      }
      assert.doesNotMatch(section('scout'), /rename|replaceBody/, name)
      assert.match(section('implementer'), /rename/, name)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  }
})

test('the mcp tool names split by the read-only annotation and the read-only server', async () => {
  const base = mkdtempSync(join(tmpdir(), 'read-names-'))
  try {
    const plugin = join(base, 'plugin')
    write(join(plugin, '.claude-plugin', 'plugin.json'), '{"name":"demo"}')
    write(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: Object.fromEntries([server('z')]) }))
    write(join(plugin, 'spikes', 'code-intel', 'z', 'tools.mjs'), "export const tools = [{ name: 'find', annotations: { readOnlyHint: true } }, { name: 'rename', annotations: { readOnlyHint: false } }, { name: 'bare' }]\n")

    assert.deepEqual(await mcpToolNames(plugin), ['mcp__plugin_demo_z__find', 'mcp__plugin_demo_z__rename', 'mcp__plugin_demo_z__bare'])
    assert.deepEqual(await mcpToolNames(plugin, { readOnly: true }), ['mcp__plugin_demo_z__find'])

    write(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: Object.fromEntries([server('y'), ['y-read', { command: 'node', args: [`${ROOT}/spikes/code-intel/y/mcp.mjs`, '--read-only'] }]]) }))
    write(join(plugin, 'spikes', 'code-intel', 'y', 'tools.mjs'), "export const tools = [{ name: 'run', annotations: { readOnlyHint: false } }]\nexport const readTools = [{ name: 'run', annotations: { readOnlyHint: true } }]\n")
    assert.deepEqual(await mcpToolNames(plugin), ['mcp__plugin_demo_y__run'])
    assert.deepEqual(await mcpToolNames(plugin, { readOnly: true }), ['mcp__plugin_demo_y-read__run'])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the hooks field is generic: a script, a matcher and arguments, validated when the arm loads', () => {
  const base = mkdtempSync(join(tmpdir(), 'hooks-arm-'))
  try {
    write(join(base, 'arm', 'guard.mjs'), 'x')
    const load = (hooks) => {
      write(join(base, 'arm', 'arm.json'), JSON.stringify({ pluginDir: '.', settings: 's.json', models: ['m'], hooks }))
      return loadArm('arm', base)
    }
    assert.deepEqual(load([{ script: 'guard.mjs', matcher: 'Bash', args: ['a'] }]).hooks, [{ script: join(base, 'arm', 'guard.mjs'), scriptName: 'guard.mjs', matcher: 'Bash', args: ['a'] }])
    assert.deepEqual(load([{ script: 'guard.mjs', matcher: 'Bash' }]).hooks[0].args, [])
    assert.equal('hooks' in loadArm('baseline'), false)
    assert.throws(() => load('x'), /invalid hooks/)
    assert.throws(() => load([{ matcher: 'Bash' }]), /no script/)
    assert.throws(() => load([{ script: 'guard.mjs' }]), /no matcher/)
    assert.throws(() => load([{ script: 'absent.mjs', matcher: 'Bash' }]), /does not exist/)
    assert.throws(() => load([{ script: 'guard.mjs', matcher: 'Bash', args: [1] }]), /invalid args/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('applyHooks copies the script into the staged plugin and appends one PreToolUse entry with the staged path', () => {
  const base = mkdtempSync(join(tmpdir(), 'hooks-stage-'))
  try {
    const plugin = join(base, 'plugin')
    write(join(plugin, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Read', hooks: [] }], SessionStart: [] } }))
    write(join(base, 'guard.mjs'), 'guard')

    const changes = applyHooks(plugin, [{ script: join(base, 'guard.mjs'), scriptName: 'guard.mjs', matcher: 'Bash|PowerShell', args: [`${ROOT}/spikes/x/cli.mjs`] }])

    const staged = JSON.parse(readFileSync(join(plugin, 'hooks', 'hooks.json'), 'utf8'))
    const root = plugin.split(sep).join('/')
    assert.equal(staged.hooks.PreToolUse.length, 2)
    assert.equal(staged.hooks.PreToolUse[0].matcher, 'Read')
    assert.deepEqual(staged.hooks.PreToolUse[1], { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: `node "${ROOT}/hooks/arm/guard.mjs" "${root}/spikes/x/cli.mjs"` }] })
    assert.deepEqual(staged.hooks.SessionStart, [])
    assert.equal(readFileSync(join(plugin, 'hooks', 'arm', 'guard.mjs'), 'utf8'), 'guard')
    assert.deepEqual(changes, [{ script: 'guard.mjs', matcher: 'Bash|PowerShell', args: [`${root}/spikes/x/cli.mjs`] }])
    assert.deepEqual(applyHooks(plugin, []), [])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the cli arms add the cli-only hook with their own staged cli path, and the other arms add none', async () => {
  for (const name of ['a-cli', 'b-cli', 'c-cli']) {
    const { arm, base, plugin } = await stagedArm(name)
    try {
      const file = join(plugin, 'hooks', 'hooks.json')
      const before = JSON.parse(readFileSync(file, 'utf8')).hooks.PreToolUse.length
      const [change] = applyHooks(plugin, arm.hooks)
      const entries = JSON.parse(readFileSync(file, 'utf8')).hooks.PreToolUse
      const added = entries[entries.length - 1]
      assert.equal(entries.length, before + 1)
      assert.equal(added.matcher, 'Bash|PowerShell')
      assert.equal(added.hooks[0].command.endsWith(`"${plugin.split(sep).join('/')}/spikes/code-intel/${name[0]}/cli.mjs"`), true)
      assert.equal(existsSync(join(plugin, 'hooks', 'arm', 'cli-only.mjs')), true)
      assert.equal(change.script, '../../arm-hooks/cli-only.mjs')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  }
  for (const name of ['baseline', 'a-mcp', 'b-mcp', 'c-mcp']) assert.equal(loadArm(name).hooks, undefined)
})
