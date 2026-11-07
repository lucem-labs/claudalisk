import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOptions } from '../cli.mjs'
import { isSkipped, parseSkips, reportFindings } from '../findings.mjs'
import { isRegularFile, trackedFiles } from '../git-files.mjs'
import { run } from '../process.mjs'

const SUSPECT = /[\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFE00-\uFE0F\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

const NAMES = new Map([
  [0xfeff, 'byte order mark inside the file'],
  [0x200b, 'zero-width space'],
  [0x200c, 'zero-width non-joiner'],
  [0x200d, 'zero-width joiner'],
  [0x2060, 'word joiner'],
  [0x200e, 'left-to-right mark'],
  [0x200f, 'right-to-left mark'],
  [0x061c, 'Arabic letter mark'],
  [0x202a, 'left-to-right embedding'],
  [0x202b, 'right-to-left embedding'],
  [0x202c, 'pop directional formatting'],
  [0x202d, 'left-to-right override'],
  [0x202e, 'right-to-left override'],
  [0x2066, 'left-to-right isolate'],
  [0x2067, 'right-to-left isolate'],
  [0x2068, 'first strong isolate'],
  [0x2069, 'pop directional isolate'],
  [0x00ad, 'soft hyphen'],
  [0x180e, 'Mongolian vowel separator'],
  [0x2028, 'line separator'],
  [0x2029, 'paragraph separator'],
  [0x2061, 'function application'],
  [0x2062, 'invisible times'],
  [0x2063, 'invisible separator'],
  [0x2064, 'invisible plus'],
])

const nameOf = (codePoint) => {
  if (NAMES.has(codePoint)) return NAMES.get(codePoint)
  if (codePoint >= 0xfe00 && codePoint <= 0xfe0f) return 'variation selector'
  if (codePoint >= 0xe0100) return 'variation selector supplement'
  return 'tag character'
}

const hex = (codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`

export const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0)

export const inFixtures = (file) => file.split('/').slice(0, -1).includes('fixtures')

export function suspectCharacters(text) {
  const found = []
  for (const match of text.matchAll(SUSPECT)) {
    const codePoint = match[0].codePointAt(0)
    if (codePoint === 0xfeff && match.index === 0) continue
    const line = text.slice(0, match.index).split('\n').length
    if (!found.some((item) => item.line === line && item.codePoint === codePoint)) found.push({ line, codePoint })
  }
  return found
}

export async function checkSourceHygiene({ appRoot, argv, env = process.env, runner = run, regular = (file) => isRegularFile(appRoot, file), read = (file) => readFileSync(join(appRoot, file)), log = console.log, error = console.error }) {
  const options = parseOptions({ skip: { type: 'string', multiple: true } }, argv)
  const skips = parseSkips(options.skip)
  const findings = []
  for (const file of await trackedFiles(runner, appRoot)) {
    if (inFixtures(file) || isSkipped(file, skips) || !regular(file)) continue
    const buffer = read(file)
    if (isBinary(buffer)) continue
    for (const { line, codePoint } of suspectCharacters(buffer.toString('utf8'))) {
      findings.push({ file, line, message: `${hex(codePoint)} ${nameOf(codePoint)} (CLA-0071)` })
    }
  }
  return reportFindings(findings, { heading: 'Invisible or bidirectional control characters found (CLA-0071):', env, log, error })
}
