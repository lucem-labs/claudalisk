import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runCaptured } from './lib.mjs'

test('a timeout kills the whole process tree and the promise settles', async () => {
  const base = mkdtempSync(join(tmpdir(), 'bench-lib-'))
  try {
    const script = join(base, 'tree.mjs')
    writeFileSync(script, [
      "import { spawn } from 'node:child_process'",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' })",
      "process.stdout.write('started')",
      'setTimeout(() => {}, 60000)',
    ].join(String.fromCharCode(10)))
    const started = Date.now()

    const result = await runCaptured(script, [], { timeoutMs: 500, graceMs: 2000 })

    assert.equal(result.timedOut, true)
    assert.match(result.stdout, /started/)
    assert.ok(Date.now() - started < 20000)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
