import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes('.t4.') ? [path] : []
  })
}

const left = sources('frontend/src').filter((file) => /\bcalculateTotal\b/.test(readFileSync(file, 'utf8')))
if (left.length) {
  console.error(left.map((file) => `${file} still mentions calculateTotal`).join('\n'))
  process.exit(1)
}
