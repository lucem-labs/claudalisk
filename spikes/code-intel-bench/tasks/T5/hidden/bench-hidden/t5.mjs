import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const expected = JSON.parse(readFileSync(join(here, 't5-expected.json'), 'utf8'))
const ANSWER = 'T5-answer.txt'
const problems = []

for (const { path, line, text } of expected) {
  const actual = readFileSync(path, 'utf8').split('\n')[line - 1]?.trim()
  if (actual !== text) problems.push(`The fixture changed under ${path}:${line}: ${actual}`)
}

const changed = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim()
if (changed) problems.push(`The task asks for an answer only, but tracked files changed:\n${changed}`)

if (!existsSync(ANSWER)) {
  problems.push(`${ANSWER} is missing`)
} else {
  const given = new Set(readFileSync(ANSWER, 'utf8').split(/\r?\n/).map((entry) => entry.trim().split(String.fromCharCode(92)).join('/').replace(/^\.\//, '')).filter(Boolean))
  const wanted = new Set(expected.map(({ path, line }) => `${path}:${line}`))
  for (const entry of wanted) if (!given.has(entry)) problems.push(`missing ${entry}`)
  for (const entry of given) if (!wanted.has(entry)) problems.push(`not a call of ILedger.Record: ${entry}`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
