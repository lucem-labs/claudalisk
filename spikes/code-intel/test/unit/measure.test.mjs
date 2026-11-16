import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { END, START, measure, renderTable, withTable } from '../../measure-schema.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('the measurement is deterministic and has an MCP and a CLI row for each interface', () => {
  assert.deepEqual(measure(), measure())
  assert.equal(renderTable(), renderTable())
  assert.deepEqual(measure().map((r) => `${r.interface}-${r.exposure}`), ['A-MCP', 'A-CLI', 'B-MCP', 'B-CLI', 'C-MCP', 'C-CLI'])
  assert.ok(measure().every((r) => r.schemaBytes > 0 && r.tokens === Math.ceil(r.schemaBytes / 4)))
  assert.deepEqual(measure().filter((r) => r.exposure === 'MCP').map((r) => r.tools), [8, 9, 1])
})

test('RESULTS.md holds the current table', () => {
  const document = readFileSync(join(here, '..', '..', 'RESULTS.md'), 'utf8')
  const table = document.slice(document.indexOf(START) + START.length, document.indexOf(END)).trim()
  assert.equal(table, renderTable())
  assert.equal(withTable(document, renderTable()), document)
})

test('a document without the markers is refused', () => {
  assert.throws(() => withTable('nothing', 'x'), /markers/)
})
