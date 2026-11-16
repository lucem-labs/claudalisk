import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const OLD = [/\bCreateOrderCommand\b/, /\bCreateOrderHandler\b/]

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'bin' || entry.name === 'obj') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.cs') && !path.includes('Hidden') ? [path] : []
  })
}

const left = sources('backend').flatMap((file) => {
  const text = readFileSync(file, 'utf8')
  return OLD.filter((pattern) => pattern.test(text)).map((pattern) => `${file} still mentions ${pattern.source}`)
})
if (left.length) {
  console.error(left.join('\n'))
  process.exit(1)
}
