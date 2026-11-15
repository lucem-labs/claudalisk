import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_DEADLINE_MS, diagnosticsText, formatDiagnostics, inputOf, outputFor } from './post-edit-hook.mjs'
import { endpointFor, isAbsent, request } from './lib/daemon-protocol.mjs'
import { normalizeRoot } from './lib/common.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const hookScript = join(here, 'post-edit-hook.mjs')
const launcher = join(here, 'test-support', 'fake-launcher.mjs')

function worktree(files = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'lsp-setups-hook-')))
  mkdirSync(join(root, '.git'))
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content)
  return root
}

const editInput = (root, file, tool = 'Edit') => JSON.stringify({ tool_name: tool, tool_input: { file_path: file }, cwd: root, hook_event_name: 'PostToolUse' })

function runHook(input, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [hookScript], { env: { ...process.env, CLAUDALISK_LSP_LAUNCHER: launcher, ...env }, stdio: ['pipe', 'pipe', 'inherit'] })
    let stdout = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.on('close', (status) => resolve({ status, stdout }))
    child.stdin.end(input)
  })
}

async function stopDaemon(root) {
  await request(endpointFor(root), { method: 'shutdown' }, { timeoutMs: 3000 }).catch(() => {})
  for (let i = 0; i < 50; i++) {
    const alive = await request(endpointFor(root), { method: 'status' }, { timeoutMs: 300 }).then(() => true, () => false)
    if (!alive) return
    await new Promise((done) => setTimeout(done, 100))
  }
}

test('the daemon endpoint is a named pipe on windows and a short unix socket elsewhere, one per normalized root', () => {
  const pipe = endpointFor('/work/App/', { platform: 'win32' })
  assert.match(pipe, /^\\\\\.\\pipe\\claudalisk-lsp-[0-9a-f]{8}$/)
  assert.equal(endpointFor('/WORK/app', { platform: 'win32' }), pipe)
  const socket = endpointFor('/work/app', { platform: 'darwin', tmp: '/var/folders/zz/abcdefghijklmnopqrstuvwxyz012345/T/' })
  assert.match(socket, /^\/var\/folders\/.+\/T\/claudalisk-lsp-[0-9a-f]{8}\.sock$/)
  assert.ok(socket.length < 100)
  assert.notEqual(endpointFor('/work/app', { platform: 'linux', tmp: '/tmp' }), endpointFor('/work/other', { platform: 'linux', tmp: '/tmp' }))
  assert.equal(normalizeRoot('/work/app/', 'linux').endsWith('/'), false)
})

test('only edits of files a server handles are taken, and the worktree root is the nearest folder with .git', () => {
  const root = worktree()
  const file = join(root, 'backend', 'A.cs')
  const taken = inputOf(editInput(root, file, 'Write'))
  assert.equal(taken.root, root)
  assert.equal(taken.file, file)
  assert.equal(inputOf(editInput(root, join(root, 'README.md'))), undefined)
  assert.equal(inputOf(editInput(root, file, 'Read')), undefined)
  assert.equal(inputOf('not json'), undefined)
  assert.equal(inputOf(JSON.stringify({ tool_name: 'Edit', tool_input: {}, cwd: root })), undefined)
  rmSync(root, { recursive: true, force: true })
})

test('diagnostics are compact path:line:col lines and only errors and warnings are reported', () => {
  const root = join(tmpdir(), 'app')
  const text = formatDiagnostics(root, join(root, 'src', 'a.ts'), [
    { line: 3, character: 7, severity: 'error', code: '2339', message: 'Property x does not exist.' },
    { line: 4, character: 1, severity: 'hint', code: '6133', message: 'unused' },
    { line: 9, character: 2, severity: 'warning', code: '', message: 'careful' },
  ])
  assert.equal(text, 'src/a.ts:3:7 error 2339 Property x does not exist.\nsrc/a.ts:9:2 warning careful')
  assert.equal(outputFor(''), '')
  assert.deepEqual(JSON.parse(outputFor(text)), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } })
})

test('when no daemon answers within the deadline the hook gives up with no text and starts the daemon once', async () => {
  const root = worktree()
  const started = []
  const text = await diagnosticsText({ file: join(root, 'a.yml'), root }, { deadlineMs: 400, start: (r) => started.push(r), ask: async () => Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' })) })
  assert.equal(text, '')
  assert.deepEqual(started, [root])
  assert.equal(isAbsent({ code: 'ECONNREFUSED' }), true)
  rmSync(root, { recursive: true, force: true })
})

test('the hook starts the daemon when it is absent, prints the diagnostics once the server is ready, and stays silent for a clean file', async () => {
  const root = worktree({ '.github/workflows/ci.yml': 'name: a\njobs:\n  x:\n    stepz: []\n' })
  const file = join(root, '.github', 'workflows', 'ci.yml')
  try {
    let printed
    for (let attempt = 0; attempt < 10 && !printed; attempt++) {
      const run = await runHook(editInput(root, file), { CLAUDALISK_LSP_HOOK_DEADLINE_MS: '4000' })
      assert.equal(run.status, 0)
      if (run.stdout.trim()) printed = JSON.parse(run.stdout)
    }
    assert.ok(printed, 'the hook never printed diagnostics')
    assert.equal(printed.hookSpecificOutput.hookEventName, 'PostToolUse')
    assert.match(printed.hookSpecificOutput.additionalContext, /^\.github\/workflows\/ci\.yml:7:5 error schema Property stepz is not allowed\.$/)
    writeFileSync(file, 'name: a\n')
    const clean = await runHook(editInput(root, file), { CLAUDALISK_LSP_HOOK_DEADLINE_MS: '4000' })
    assert.equal(clean.status, 0)
    assert.equal(clean.stdout.trim(), '')
  } finally {
    await stopDaemon(root)
    rmSync(root, { recursive: true, force: true })
  }
})

test('the hook exits 0 and prints nothing for a file no server handles, and the default deadline is positive', async () => {
  const root = worktree({ 'README.md': 'x' })
  const run = await runHook(editInput(root, join(root, 'README.md')))
  assert.equal(run.status, 0)
  assert.equal(run.stdout, '')
  assert.ok(DEFAULT_DEADLINE_MS > 0)
  rmSync(root, { recursive: true, force: true })
})
