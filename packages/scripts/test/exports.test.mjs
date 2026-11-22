import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotFile = join(dirname(fileURLToPath(import.meta.url)), 'exports.snapshot.json')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
const updateVariable = 'UPDATE_EXPORTS_SNAPSHOT'

async function publicApi() {
  const api = {}
  for (const [name, target] of Object.entries(manifest.exports).sort(([left], [right]) => (left < right ? -1 : 1))) {
    if (!target.endsWith('.mjs')) {
      api[name] = []
      continue
    }
    const module = await import(pathToFileURL(join(packageDir, target)).href)
    api[name] = Object.keys(module).sort()
  }
  return api
}

test('the exports map and the names of each export match the snapshot', async () => {
  const api = await publicApi()
  if (process.env[updateVariable] === '1') writeFileSync(snapshotFile, `${JSON.stringify(api, null, 2)}\n`)
  const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'))
  assert.deepEqual(
    api,
    snapshot,
    `The public API of ${manifest.name} differs from test/exports.snapshot.json. A removed or renamed export breaks apps, so it needs a minor bump while the major is 0 (CLA-0098). Bump the version, then run this test with ${updateVariable}=1 to rewrite the snapshot.`,
  )
})
