import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { test } from 'node:test'
import { applyAgents, applyOverlay, armForModel, claudeArguments, isLeftOut, loadArm, stagePlugin } from './arms.mjs'

function write(file, text = 'x') {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

test('staging leaves out spikes and .git so the agent cannot read hidden tests or reference solutions', () => {
  const base = mkdtempSync(join(tmpdir(), 'stage-'))
  const plugin = join(base, 'plugin')
  try {
    write(join(plugin, '.claude-plugin', 'plugin.json'), '{}')
    write(join(plugin, 'hooks', 'hooks.json'), '{}')
    write(join(plugin, 'skills', 'spikes', 'keep.md'))
    write(join(plugin, 'spikes', 'code-intel-bench', 'tasks', 'T1', 'hidden', 'secret.cs'))
    write(join(plugin, 'spikes', 'code-intel-bench', 'tasks', 'T1', 'reference', 'solution.patch'))
    write(join(plugin, '.git', 'HEAD'))

    const staged = stagePlugin(plugin, join(base, 'staged'))

    assert.equal(existsSync(join(staged, '.claude-plugin', 'plugin.json')), true)
    assert.equal(existsSync(join(staged, 'hooks', 'hooks.json')), true)
    assert.equal(existsSync(join(staged, 'skills', 'spikes', 'keep.md')), true)
    assert.equal(existsSync(join(staged, 'spikes')), false)
    assert.equal(existsSync(join(staged, '.git')), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('only the top-level spikes and .git are left out', () => {
  assert.equal(isLeftOut(join('/p', 'spikes'), '/p'), true)
  assert.equal(isLeftOut(join('/p', 'spikes', 'a', 'b'), '/p'), true)
  assert.equal(isLeftOut(join('/p', '.git', 'HEAD'), '/p'), true)
  assert.equal(isLeftOut(join('/p', 'skills', 'spikes'), '/p'), false)
  assert.equal(isLeftOut('/p', '/p'), false)
})

test('an arm resolves its plugin directory and settings next to its arm.json', () => {
  const base = mkdtempSync(join(tmpdir(), 'arms-'))
  try {
    write(join(base, 'trial', 'arm.json'), JSON.stringify({ pluginDir: '../plugin', settings: 'settings.json', model: 'm1' }))

    const arm = loadArm('trial', base)

    assert.deepEqual(arm.models, ['m1'])
    write(join(base, 'many', 'arm.json'), JSON.stringify({ pluginDir: '../plugin', settings: 'settings.json', models: ['m1', 'm2'] }))
    assert.deepEqual(loadArm('many', base).models, ['m1', 'm2'])
    write(join(base, 'none', 'arm.json'), JSON.stringify({ pluginDir: '.', settings: 's.json', models: [] }))
    assert.throws(() => loadArm('none', base), /no models/)
    assert.equal(arm.pluginDir, join(base, 'plugin'))
    assert.equal(arm.settings, join(base, 'trial', 'settings.json'))
    assert.throws(() => loadArm('missing', base), /no arm missing/)
    write(join(base, 'bad', 'arm.json'), JSON.stringify({ pluginDir: '.' }))
    assert.throws(() => loadArm('bad', base), /no settings/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('an arm is narrowed to one of its models', () => {
  const arm = { name: 'a', models: ['m1', 'm2'] }

  assert.equal(armForModel(arm, 'm2').model, 'm2')
  assert.throws(() => armForModel(arm, 'm3'), /no model m3/)
})

test('the baseline arm is this repository plugin, on both models', () => {
  const arm = loadArm('baseline')

  assert.deepEqual(arm.models, ['claude-sonnet-5-5', 'claude-opus-5-5'])

  assert.equal(existsSync(join(arm.pluginDir, '.claude-plugin', 'plugin.json')), true)
  assert.notEqual(JSON.parse(readFileSync(arm.settings, 'utf8')), null)
})

test('the command line has a fresh session, stream-json, the plugin, the settings, the model and the budget, and never --bare', () => {
  const args = claudeArguments({ arm: { settings: '/s.json', model: 'm1' }, plugin: '/stage', budget: 3 })

  assert.deepEqual(args, ['-p', '--output-format', 'stream-json', '--verbose', '--plugin-dir', '/stage', '--setting-sources', 'project,local', '--settings', '/s.json', '--model', 'm1', '--max-budget-usd', '3', '--permission-mode', 'bypassPermissions'])
  assert.equal(args.includes('--bare'), false)
})

test('an include copies a path under spikes into the stage, and the bench folder stays out whatever it says', () => {
  const base = mkdtempSync(join(tmpdir(), 'stage-'))
  const plugin = join(base, 'plugin')
  try {
    write(join(plugin, 'spikes', 'code-intel', 'b', 'mcp.mjs'))
    write(join(plugin, 'spikes', 'lsp-host', 'lib', 'x.mjs'))
    write(join(plugin, 'spikes', 'other', 'y.mjs'))
    write(join(plugin, 'spikes', 'code-intel-bench', 'tasks', 'T1', 'hidden', 'secret.cs'))
    write(join(plugin, '.git', 'HEAD'))

    const staged = stagePlugin(plugin, join(base, 'staged'), { include: ['spikes/code-intel', 'spikes/lsp-host', 'spikes/code-intel-bench', 'spikes', '.git'] })

    assert.equal(existsSync(join(staged, 'spikes', 'code-intel', 'b', 'mcp.mjs')), true)
    assert.equal(existsSync(join(staged, 'spikes', 'lsp-host', 'lib', 'x.mjs')), true)
    assert.equal(existsSync(join(staged, 'spikes', 'code-intel-bench')), false)
    assert.equal(existsSync(join(staged, '.git')), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('an include of one folder leaves its siblings under spikes out', () => {
  const include = [join('spikes', 'code-intel')]

  assert.equal(isLeftOut(join('/p', 'spikes'), '/p', include), false)
  assert.equal(isLeftOut(join('/p', 'spikes', 'code-intel', 'a', 'b.mjs'), '/p', include), false)
  assert.equal(isLeftOut(join('/p', 'spikes', 'lsp-host'), '/p', include), true)
  assert.equal(isLeftOut(join('/p', 'spikes', 'code-intel-bench'), '/p', include), true)
})

test('an overlay replaces staged files and fills the plugin root token in its markdown with the stage path', () => {
  const base = mkdtempSync(join(tmpdir(), 'overlay-'))
  try {
    write(join(base, 'plugin', '.mcp.json'), 'old')
    write(join(base, 'plugin', 'skills', 'keep', 'SKILL.md'), 'keep ${CLAUDE_PLUGIN_ROOT}')
    write(join(base, 'arm', 'overlay', '.mcp.json'), '{"a":"${CLAUDE_PLUGIN_ROOT}/x"}')
    write(join(base, 'arm', 'overlay', 'skills', 'new', 'SKILL.md'), 'run ${CLAUDE_PLUGIN_ROOT}/spikes/b.mjs')

    const staged = stagePlugin(join(base, 'plugin'), join(base, 'staged'), { overlay: join(base, 'arm', 'overlay') })
    const root = staged.split(sep).join('/')

    assert.equal(readFileSync(join(staged, '.mcp.json'), 'utf8'), '{"a":"${CLAUDE_PLUGIN_ROOT}/x"}')
    assert.equal(readFileSync(join(staged, 'skills', 'new', 'SKILL.md'), 'utf8'), `run ${root}/spikes/b.mjs`)
    assert.equal(readFileSync(join(staged, 'skills', 'keep', 'SKILL.md'), 'utf8'), 'keep ${CLAUDE_PLUGIN_ROOT}')
    assert.throws(() => applyOverlay(join(base, 'missing'), staged), /not a folder/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('an arm resolves include, overlay and toolPattern', () => {
  const base = mkdtempSync(join(tmpdir(), 'arms-'))
  try {
    write(join(base, 'x', 'arm.json'), JSON.stringify({ pluginDir: '../p', settings: 's.json', model: 'm', include: ['spikes/code-intel'], overlay: 'overlay', toolPattern: 'code-intel' }))
    const arm = loadArm('x', base)

    assert.deepEqual(arm.include, [join('spikes', 'code-intel')])
    assert.equal(arm.overlay, join(base, 'x', 'overlay'))
    assert.equal(arm.toolPattern, 'code-intel')
    write(join(base, 'y', 'arm.json'), JSON.stringify({ pluginDir: '.', settings: 's.json', model: 'm', toolPattern: '(' }))
    assert.throws(() => loadArm('y', base))
    assert.deepEqual(loadArm('baseline').include, [])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the six code-intel arms differ from the baseline only by include, overlay and toolPattern', () => {
  const baseline = loadArm('baseline')
  for (const interfaceName of ['a', 'b', 'c']) {
    for (const kind of ['mcp', 'cli']) {
      const arm = loadArm(`${interfaceName}-${kind}`)

      assert.equal(arm.pluginDir, baseline.pluginDir)
      assert.deepEqual(arm.models, baseline.models)
      assert.equal(readFileSync(arm.settings, 'utf8'), readFileSync(baseline.settings, 'utf8'))
      assert.deepEqual(arm.include, [join('spikes', 'code-intel'), join('spikes', 'lsp-host')])
      assert.equal(existsSync(join(arm.overlay, kind === 'mcp' ? '.mcp.json' : join('skills', 'code-intel', 'SKILL.md'))), true)
      assert.equal(new RegExp(arm.toolPattern).test(kind === 'mcp' ? `mcp__plugin_claudalisk_code-intel-${interfaceName}__find` : `node /s/spikes/code-intel/${interfaceName}/cli.mjs find X`), true)
    }
  }
})

test('the mcp arms keep the plugin servers and add their own, and the cli arms write the absolute stage path', () => {
  const root = JSON.parse(readFileSync(join(loadArm('baseline').pluginDir, '.mcp.json'), 'utf8'))
  const mcp = JSON.parse(readFileSync(join(loadArm('b-mcp').overlay, '.mcp.json'), 'utf8'))
  const skill = readFileSync(join(loadArm('b-cli').overlay, 'skills', 'code-intel', 'SKILL.md'), 'utf8')

  assert.deepEqual(Object.keys(mcp.mcpServers), [...Object.keys(root.mcpServers), 'code-intel-b'])
  assert.deepEqual(mcp.mcpServers['code-intel-b'].args, ['${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/b/mcp.mjs'])
  assert.equal(skill.includes('${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/b/cli.mjs'), true)
})

function agentPlugin(base) {
  const plugin = join(base, 'plugin')
  write(join(plugin, '.claude-plugin', 'plugin.json'), '{"name":"demo"}')
  write(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x', args: ['--yes'] }, 'code-intel-z': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/z/mcp.mjs'] } } }))
  write(join(plugin, 'spikes', 'code-intel', 'z', 'tools.mjs'), "export const tools = [{ name: 'find' }, { name: 'rename' }]\n")
  write(join(plugin, 'agents', 'scout.md'), '---\nname: scout\ntools: Read, Grep\nmodel: haiku\n---\n\nBody.\n')
  write(join(plugin, 'agents', 'implementer.md'), '---\nname: implementer\ntools: Read, Bash\n---\n\nBody.\n')
  return plugin
}

test('an arm may add tools and a note to the staged agents, and the changes are listed', async () => {
  const base = mkdtempSync(join(tmpdir(), 'agents-'))
  try {
    const plugin = agentPlugin(base)
    write(join(base, 'arm', 'note.md'), '---\nname: skill\n---\n\nTools: ${mcpTools}. Run node ${CLAUDE_PLUGIN_ROOT}/x.mjs\n')
    write(join(base, 'arm', 'arm.json'), JSON.stringify({ pluginDir: '../plugin', settings: 's.json', models: ['m'], agents: { scout: { addTools: ['Bash', '${mcpTools}'], note: 'note.md' }, implementer: { addTools: ['Bash'] } } }))
    const arm = loadArm('arm', base)

    const changes = await applyAgents(plugin, arm.agents)

    const scout = readFileSync(join(plugin, 'agents', 'scout.md'), 'utf8')
    assert.match(scout, /^tools: Read, Grep, Bash, mcp__plugin_demo_code-intel-z__find, mcp__plugin_demo_code-intel-z__rename$/m)
    assert.match(scout, /model: haiku/)
    assert.match(scout, /Body\.\n\n## Code intelligence\n\nTools: mcp__plugin_demo_code-intel-z__find, mcp__plugin_demo_code-intel-z__rename\. Run node .*\/plugin\/x\.mjs\n$/)
    assert.equal(scout.includes('name: skill'), false)
    assert.equal(readFileSync(join(plugin, 'agents', 'implementer.md'), 'utf8').includes('tools: Read, Bash\n'), true)
    assert.deepEqual(changes, [
      { agent: 'scout', addedTools: ['Bash', 'mcp__plugin_demo_code-intel-z__find', 'mcp__plugin_demo_code-intel-z__rename'], note: 'note.md' },
      { agent: 'implementer', addedTools: [] },
    ])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('agent changes are refused for a missing agent, note or tools line', async () => {
  const base = mkdtempSync(join(tmpdir(), 'agents-'))
  try {
    const plugin = agentPlugin(base)
    await assert.rejects(applyAgents(plugin, { ghost: { addTools: ['Bash'] } }), /no agent ghost/)
    write(join(plugin, 'agents', 'bare.md'), '---\nname: bare\n---\n')
    await assert.rejects(applyAgents(plugin, { bare: { addTools: ['Bash'] } }), /no tools line/)
    write(join(base, 'arm', 'arm.json'), JSON.stringify({ pluginDir: '.', settings: 's.json', models: ['m'], agents: { scout: { note: 'absent.md' } } }))
    assert.throws(() => loadArm('arm', base), /does not exist/)
    write(join(base, 'arm', 'arm.json'), JSON.stringify({ pluginDir: '.', settings: 's.json', models: ['m'], agents: { scout: { addTools: 'Bash' } } }))
    assert.throws(() => loadArm('arm', base), /invalid addTools/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the real arms give both agents their tools and a note: mcp tool names from the interface, Bash for the cli scout', async () => {
  const stage = async (name) => {
    const arm = loadArm(name)
    const base = mkdtempSync(join(tmpdir(), 'real-agents-'))
    const plugin = stagePlugin(arm.pluginDir, join(base, 'plugin'), { include: arm.include, overlay: arm.overlay })
    const changes = await applyAgents(plugin, arm.agents)
    return { base, plugin, changes, scout: readFileSync(join(plugin, 'agents', 'scout.md'), 'utf8'), implementer: readFileSync(join(plugin, 'agents', 'implementer.md'), 'utf8') }
  }
  const mcp = await stage('b-mcp')
  const cli = await stage('c-cli')
  try {
    for (const text of [mcp.scout, mcp.implementer]) assert.match(text, /^tools: .*mcp__plugin_claudalisk_code-intel-b__references/m)
    assert.match(mcp.implementer, /^tools: .*mcp__plugin_claudalisk_code-intel-b__replaceBody/m)
    assert.doesNotMatch(mcp.scout, /^tools: .*replaceBody/m)
    assert.match(cli.scout, /^tools: Read, Grep, Glob, LSP, Bash\r?$/m)
    assert.match(cli.implementer, /^tools: Read, Write, Edit, Glob, Grep, Bash\r?$/m)
    assert.equal(cli.scout.includes(`${cli.plugin.split(sep).join('/')}/spikes/code-intel/c/cli.mjs run`), true)
    assert.equal(cli.scout.includes('${CLAUDE_PLUGIN_ROOT}'), false)
    assert.deepEqual(cli.changes.map((change) => change.agent), ['scout', 'implementer'])
  } finally {
    rmSync(mcp.base, { recursive: true, force: true })
    rmSync(cli.base, { recursive: true, force: true })
  }
})

test('every mcp arm adds tool names its toolPattern matches', async () => {
  for (const interfaceName of ['a', 'b', 'c']) {
    const arm = loadArm(`${interfaceName}-mcp`)
    const base = mkdtempSync(join(tmpdir(), 'pattern-'))
    try {
      const plugin = stagePlugin(arm.pluginDir, join(base, 'plugin'), { include: arm.include, overlay: arm.overlay })
      const [change] = await applyAgents(plugin, arm.agents)
      assert.equal(change.addedTools.length > 0, true)
      for (const tool of change.addedTools) assert.equal(new RegExp(arm.toolPattern).test(tool), true, tool)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  }
})
