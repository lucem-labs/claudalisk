import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EmulatedClient, claudeCodeVersion, emulatedCapabilities, emulatedInitializeParams, settingFor } from './lib/claude-code-client.mjs'
import { DIAGNOSTIC_CASES, prepareApp, runPullCase, runPushCase } from './lib/cases.mjs'
import { HostServer } from './lib/host-server.mjs'
import { hostLaunch as fakeLaunch } from './test-support/fake-launcher.mjs'
import { YAML_SETTINGS } from './lib/launch.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fakeServer = join(here, 'test-support', 'fake-lsp-server.mjs')

const temporaryApp = () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'lsp-setups-test-')))
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  prepareApp(root)
  return root
}

test('the emulated client advertises what Claude Code 2.1.316 sends, and no pull diagnostics', () => {
  const capabilities = emulatedCapabilities({ settings: YAML_SETTINGS })
  assert.equal(claudeCodeVersion, '2.1.316')
  assert.equal(capabilities.workspace.configuration, true)
  assert.equal(capabilities.workspace.workspaceFolders, false)
  assert.equal(capabilities.textDocument.diagnostic, undefined)
  assert.equal(capabilities.textDocument.publishDiagnostics.versionSupport, false)
  assert.deepEqual(capabilities.general.positionEncodings, ['utf-16'])
})

test('workspace.configuration is advertised only when the server config has settings', () => {
  assert.equal(emulatedCapabilities().workspace.configuration, undefined)
  assert.equal(emulatedCapabilities({ settings: {} }).workspace.configuration, undefined)
  assert.equal(emulatedCapabilities({ settings: YAML_SETTINGS }).workspace.configuration, true)
})

test('initialize carries the root as rootUri and workspaceFolders, and initializationOptions only when configured', () => {
  const root = realpathSync.native(tmpdir())
  const params = emulatedInitializeParams(root)
  assert.equal(params.rootUri, params.workspaceFolders[0].uri)
  assert.equal('initializationOptions' in params, false)
  assert.deepEqual(emulatedInitializeParams(root, { initializationOptions: { a: 1 } }).initializationOptions, { a: 1 })
})

test('configuration requests are answered from the settings by section', () => {
  assert.deepEqual(settingFor(YAML_SETTINGS, 'yaml'), YAML_SETTINGS.yaml)
  assert.equal(settingFor(YAML_SETTINGS, 'yaml.schemaStore.enable'), true)
  assert.equal(settingFor(YAML_SETTINGS, 'other'), null)
  assert.equal(settingFor(undefined, 'yaml'), null)
})

test('a push case sees the broken workflow flagged and the fixed one cleared', async () => {
  const root = temporaryApp()
  const client = new EmulatedClient({ spec: { command: process.execPath, args: [fakeServer], cwd: root }, root, settings: YAML_SETTINGS })
  try {
    await client.start()
    const result = await runPushCase(client, root, 'yaml', { repeats: 2, waitMs: 1500 })
    assert.equal(result.correct, 2)
    assert.equal(result.brokenNeededSave, 0)
    assert.ok(result.brokenLatency.medianMs > 0)
  } finally {
    await client.stop()
    rmSync(root, { recursive: true, force: true })
  }
})

test('a push case that never sees the diagnostic falls back to didSave and reports it as not found', async () => {
  const root = temporaryApp()
  const client = new EmulatedClient({ spec: { command: process.execPath, args: [fakeServer], cwd: root }, root })
  try {
    await client.start()
    const original = DIAGNOSTIC_CASES.yaml.matches
    DIAGNOSTIC_CASES.yaml.matches = () => false
    try {
      const result = await runPushCase(client, root, 'yaml', { repeats: 1, waitMs: 200 })
      assert.equal(result.brokenFound, 0)
      assert.equal(result.correct, 0)
    } finally {
      DIAGNOSTIC_CASES.yaml.matches = original
    }
  } finally {
    await client.stop()
    rmSync(root, { recursive: true, force: true })
  }
})

test('the host pulls diagnostics after each edit when the server supports pull', async () => {
  const root = temporaryApp()
  process.env.FAKE_LSP_PULL = '1'
  const server = await HostServer.start('yaml', root, { launcher: fakeLaunch })
  try {
    assert.equal(server.pull, true)
    const result = await runPullCase(server, root, 'yaml', { repeats: 2, waitMs: 1500 })
    assert.equal(result.mode, 'pull')
    assert.equal(result.correct, 2)
  } finally {
    delete process.env.FAKE_LSP_PULL
    await server.stop()
    rmSync(root, { recursive: true, force: true })
  }
})

test('the host takes the server pushes when it does not support pull', async () => {
  const root = temporaryApp()
  const server = await HostServer.start('yaml', root, { launcher: fakeLaunch })
  try {
    assert.equal(server.pull, false)
    const result = await runPullCase(server, root, 'yaml', { repeats: 2, waitMs: 1500 })
    assert.equal(result.mode, 'push-fallback')
    assert.equal(result.correct, 2)
  } finally {
    await server.stop()
    rmSync(root, { recursive: true, force: true })
  }
})
