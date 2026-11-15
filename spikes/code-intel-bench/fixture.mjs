#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, runAsync } from '../../tools/check-registry.mjs'
import { generateApp } from '../../tools/new-app.mjs'
import { builtRegistry, readJson } from '../../tools/registry.mjs'
import { addModule } from '../../tools/scaffold.mjs'
import { benchRoot, fixtureFile, git, repositoryRoot } from './lib.mjs'

export const FIXTURE = {
  root: 'Bench',
  name: 'bench-app',
  repo: 'lucem-labs/bench-app',
  module: 'Ordering',
  aggregate: 'Order',
  second: { module: 'Billing', aggregate: 'Invoice' },
  now: '2026-01-01T00:00:00.000Z',
  overlay: join(benchRoot, 'fixture', 'overlay'),
}

const IDENTITY = {
  GIT_AUTHOR_NAME: 'claudalisk',
  GIT_AUTHOR_EMAIL: 'claudalisk@example.com',
  GIT_COMMITTER_NAME: 'claudalisk',
  GIT_COMMITTER_EMAIL: 'claudalisk@example.com',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
}

export function fixtureRecord({ claudaliskCommit, head, path }) {
  return { claudaliskCommit, head, path }
}

export function applyOverlay(app, overlay = FIXTURE.overlay) {
  if (!existsSync(overlay)) throw new Error(`${overlay} is missing`)
  cpSync(overlay, app, { recursive: true, force: true })
}

export async function buildFixture(out, { log = console.log } = {}) {
  const target = resolve(out)
  if (existsSync(target) && readdirSync(target).length > 0) throw new Error(`${target} is not empty`)
  const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'claudalisk-bench-')))
  const home = join(work, 'home')
  mkdirSync(home)
  Object.assign(process.env, IDENTITY)
  const now = new Date(FIXTURE.now)
  const claudaliskCommit = await git(['rev-parse', 'HEAD'], repositoryRoot)
  const server = await serve(builtRegistry)
  try {
    const scripts = join(repositoryRoot, 'packages', 'scripts')
    const { version } = readJson(join(scripts, 'package.json'))
    await runAsync('npm', ['pack', '--pack-destination', work], scripts)
    const scriptsPackage = join(work, `claudalisk-scripts-${version}.tgz`).replaceAll(sep, '/')
    const registry = `http://127.0.0.1:${server.address().port}/{name}.json`
    log('Generating the app')
    await generateApp(
      { target, root: FIXTURE.root, name: FIXTURE.name, repo: FIXTURE.repo, module: FIXTURE.module, aggregate: FIXTURE.aggregate, registry, skill: false, scriptsPackage, now },
      { run: runAsync, home, log },
    )
    log('Adding the second module')
    addModule({ appRoot: target, module: FIXTURE.second.module, aggregate: FIXTURE.second.aggregate, now })
    log('Applying the overlay')
    applyOverlay(target)
    await git(['add', '--all'], target, IDENTITY)
    await git(['commit', '--quiet', '--message', 'Add the benchmark overlay'], target, IDENTITY)
    const head = await git(['rev-parse', 'HEAD'], target)
    writeFileSync(fixtureFile, `${JSON.stringify(fixtureRecord({ claudaliskCommit, head, path: target }), null, 2)}\n`)
    log(`Fixture ${head.slice(0, 7)} from claudalisk ${claudaliskCommit.slice(0, 7)} in ${target}`)
    return { head, claudaliskCommit, path: target }
  } finally {
    server.close()
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, out] = process.argv.slice(2)
  try {
    if (command !== 'build' || !out) throw new Error('Usage: node fixture.mjs build <folder>')
    await buildFixture(out)
  } catch (error) {
    console.error(`x ${error.message}`)
    process.exit(1)
  }
}
