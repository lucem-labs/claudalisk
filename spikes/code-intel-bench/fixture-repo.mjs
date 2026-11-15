import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fixtureFile, git } from './lib.mjs'

export function readFixture(file = fixtureFile) {
  if (!existsSync(file)) throw new Error(`${file} is missing; run: node spikes/code-intel-bench/fixture.mjs build <folder>`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export async function cloneFixture(destination, { fixture = readFixture() } = {}) {
  await git(['clone', '--quiet', '--no-hardlinks', fixture.path, destination], tmpdir())
  const head = await git(['rev-parse', 'HEAD'], destination)
  if (head !== fixture.head) throw new Error(`The fixture at ${fixture.path} is at ${head}, not the pinned ${fixture.head}`)
  return destination
}

