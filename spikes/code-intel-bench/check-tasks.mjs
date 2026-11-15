#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { buildFixture } from './fixture.mjs'
import { cloneFixture, readFixture } from './fixture-repo.mjs'
import { git } from './lib.mjs'
import { copyDependencies } from './runner.mjs'
import { accepted, installHidden, loadTask, parseTaskList, runChecks } from './tasks.mjs'

export async function checkTask(id, fixture, { log = console.log, keep = false } = {}) {
  const task = loadTask(id)
  const problems = []
  for (const variant of ['untouched', 'reference']) {
    const base = mkdtempSync(join(tmpdir(), `claudalisk-bench-${id}-${variant}-`))
    const copy = join(base, 'app')
    try {
      await cloneFixture(copy, { fixture })
      copyDependencies(fixture.path, copy)
      if (variant === 'reference') {
        const patch = join(task.folder, 'reference', 'solution.patch')
        if (!existsSync(patch)) throw new Error(`${patch} is missing`)
        await git(['apply', '--whitespace=nowarn', patch], copy)
      }
      installHidden(task, copy)
      const checks = await runChecks(task, copy)
      const passed = accepted(checks)
      log(`${id} ${variant}: ${checks.map((check) => `${check.passed ? 'pass' : 'FAIL'} ${check.name}`).join('; ')}`)
      if (variant === 'untouched' && passed) problems.push(`${id}: every hidden check passes on the untouched fixture`)
      if (variant === 'reference' && !passed) {
        problems.push(`${id}: the reference solution fails ${checks.filter((check) => !check.passed).map((check) => check.name).join(', ')}`)
        for (const check of checks.filter((entry) => !entry.passed)) log(`${check.name}:\n${check.tail}`)
      }
    } finally {
      if (!keep) rmSync(base, { recursive: true, force: true })
    }
  }
  return problems
}

export async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { tasks: { type: 'string' }, build: { type: 'string' }, keep: { type: 'boolean', default: false } } })
  if (values.build) await buildFixture(values.build)
  const fixture = readFixture()
  const problems = []
  for (const id of parseTaskList(values.tasks)) problems.push(...(await checkTask(id, fixture, { keep: values.keep })))
  if (problems.length) throw new Error(problems.join('\n'))
  console.log('Every hidden test fails on the untouched fixture and passes on its reference solution.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(`x ${error.message}`)
    process.exit(1)
  }
}
