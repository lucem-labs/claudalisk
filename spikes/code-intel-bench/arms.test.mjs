import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { armForModel, claudeArguments, isLeftOut, loadArm, stagePlugin } from './arms.mjs'

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
