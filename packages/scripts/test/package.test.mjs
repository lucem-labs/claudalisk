import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scriptsPackage } from '../../../tools/release.mjs'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repository = join(packageDir, '..', '..')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
const entriesDir = join(repository, 'templates', 'app', 'scripts')

const commands = {
  deploy: 'deploy',
  backup: 'backup',
  restore: 'restore',
  'prune-backups': 'pruneBackups',
  'refresh-dev': 'refreshDev',
  init: 'init',
  migrate: 'migrate',
}

test('the release workflow finds the package and its name', () => {
  assert.deepEqual(scriptsPackage(repository), { name: '@claudalisk/scripts', version: manifest.version, dir: 'packages/scripts' })
})

test('the package is public, MIT, ESM and ships only its library', () => {
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.publishConfig.access, 'public')
  assert.equal(manifest.private, undefined)
  assert.equal(manifest.dependencies, undefined)
  assert.equal(manifest.scripts, undefined)
  assert.deepEqual(manifest.files, ['src', '!src/**/*.test.mjs', 'README.md', 'LICENSE'])
  assert.ok(existsSync(join(packageDir, 'LICENSE')))
})

test('the version is a release above the 0.0.1 placeholder', () => {
  const [major, minor, patch] = manifest.version.split('.').map(Number)
  assert.ok(major > 0 || minor > 0 || patch > 1, manifest.version)
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
})

test('every entry of the exports map resolves to a file that imports', async () => {
  const entries = Object.entries(manifest.exports)
  assert.ok(entries.length > 0)
  for (const [name, target] of entries) {
    assert.ok(target.startsWith('./'), name)
    const file = join(packageDir, target)
    assert.ok(existsSync(file), `${name} points at ${target}`)
    if (target.endsWith('.mjs')) await import(pathToFileURL(file).href)
  }
})

test('every command is exported under its own name as a function', async () => {
  for (const [name, exported] of Object.entries(commands)) {
    const module = await import(pathToFileURL(join(packageDir, manifest.exports[`./${name}`])).href)
    assert.equal(typeof module[exported], 'function', `./${name} exports ${exported}`)
  }
  const cli = await import(pathToFileURL(join(packageDir, manifest.exports['./cli'])).href)
  assert.equal(typeof cli.runMain, 'function')
})

test('every entry script is a thin call of runMain on an export the package has', async () => {
  for (const [name, exported] of Object.entries(commands)) {
    const text = readFileSync(join(entriesDir, `${name}.mjs`), 'utf8').replace(/\r\n/g, '\n')
    assert.equal(
      text,
      `import { runMain } from '@claudalisk/scripts/cli'\nimport { ${exported} } from '@claudalisk/scripts/${name}'\n\nrunMain(${exported})\n`,
    )
    assert.ok(Object.hasOwn(manifest.exports, `./${name}`), `${name} is in the exports map`)
    assert.ok(Object.hasOwn(manifest.exports, './cli'))
  }
})

test('the templates hold an entry for each command and no other script of the package', () => {
  const present = readdirSync(entriesDir).filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'))
  for (const name of Object.keys(commands)) assert.ok(present.includes(`${name}.mjs`), name)
})

test('the library imports nothing but Node and itself', () => {
  const src = join(packageDir, 'src')
  const files = []
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(folder, entry.name))
      else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) files.push(join(folder, entry.name))
    }
  }
  walk(src)
  for (const file of files) {
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
      assert.ok(specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../'), `${file} imports ${specifier}`)
    }
  }
})
