import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? 'success'
const prompt = readFileSync(0, 'utf8')

if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), prompt })}\n`)
}
if (process.env.FAKE_CLAUDE_WRITE) {
  const { file, text } = JSON.parse(process.env.FAKE_CLAUDE_WRITE)
  writeFileSync(join(process.cwd(), file), text)
}
process.stdout.write(readFileSync(join(here, 'streams', `${scenario}.jsonl`), 'utf8'))
process.exitCode = scenario === 'crash' ? 1 : 0
