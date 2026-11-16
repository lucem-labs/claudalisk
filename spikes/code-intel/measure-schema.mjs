import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listTools } from './lib/mcp.mjs'
import { tools as a } from './a/tools.mjs'
import { tools as b } from './b/tools.mjs'
import { tools as c } from './c/tools.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const START = '<!-- schema:start -->'
export const END = '<!-- schema:end -->'
export const BYTES_PER_TOKEN = 4

const INTERFACES = { A: { id: 'a', tools: a }, B: { id: 'b', tools: b }, C: { id: 'c', tools: c } }

const bytes = (text) => Buffer.byteLength(text.replace(/\r\n/g, '\n'), 'utf8')
const estimate = (count) => Math.ceil(count / BYTES_PER_TOKEN)

export function measure() {
  const rows = []
  for (const [label, { id, tools }] of Object.entries(INTERFACES)) {
    const listing = JSON.stringify({ tools: listTools(tools) })
    const fragment = readFileSync(join(here, 'exposure', `${id}.mcp.json`), 'utf8')
    const skill = readFileSync(join(here, 'exposure', `${id}.skill.md`), 'utf8')
    rows.push({ interface: label, exposure: 'MCP', tools: tools.length, schemaBytes: bytes(listing), tokens: estimate(bytes(listing)), configBytes: bytes(fragment) })
    rows.push({ interface: label, exposure: 'CLI', tools: 0, operations: tools.length, schemaBytes: bytes(skill), tokens: estimate(bytes(skill)), configBytes: 0 })
  }
  return rows
}

export function renderTable(rows = measure()) {
  const lines = ['| Interface | Exposure | Tools | Schema bytes | Estimated tokens | Config bytes |', '| --- | --- | ---: | ---: | ---: | ---: |']
  for (const r of rows) {
    const schema = r.exposure === 'MCP' ? `${r.schemaBytes} (tools/list)` : `${r.schemaBytes} (skill text)`
    lines.push(`| ${r.interface} | ${r.exposure} | ${r.tools} | ${schema} | ${r.tokens} | ${r.configBytes} |`)
  }
  lines.push('', `Tokens are an estimate: bytes divided by ${BYTES_PER_TOKEN}, rounded up. The benchmark gives the real figure.`)
  return lines.join('\n')
}

export function withTable(document, table) {
  const start = document.indexOf(START)
  const end = document.indexOf(END)
  if (start < 0 || end < start) throw new Error(`RESULTS.md has no ${START} and ${END} markers`)
  return `${document.slice(0, start + START.length)}\n${table}\n${document.slice(end)}`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const table = renderTable()
  if (process.argv.includes('--write')) {
    const file = join(here, 'RESULTS.md')
    writeFileSync(file, withTable(readFileSync(file, 'utf8'), table))
  }
  console.log(table)
}
