import { existsSync, readFileSync } from 'node:fs'

const own = 'frontend/src/shared/lib/slugify.test.ts'
if (!existsSync(own)) {
  console.error(`${own} is missing: the function ships with its own test`)
  process.exit(1)
}
if (!/\bslugify\b/.test(readFileSync(own, 'utf8'))) {
  console.error(`${own} does not test slugify`)
  process.exit(1)
}
