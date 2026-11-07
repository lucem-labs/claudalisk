import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOptions } from '../cli.mjs'
import { isSkipped, parseSkips, reportFindings } from '../findings.mjs'
import { trackedFiles } from '../git-files.mjs'
import { run } from '../process.mjs'

const SUSPECT = /[﻿​-‍⁠‪-‮⁦-⁩‎‏؜]/gu

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
])

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

export async function checkSourceHygiene({ appRoot, argv, env = process.env, runner = run, read = (file) => readFileSync(join(appRoot, file)), log = console.log, error = console.error }) {
  const options = parseOptions({ skip: { type: 'string', multiple: true } }, argv)
  const skips = parseSkips(options.skip)
  const findings = []
  for (const file of await trackedFiles(runner, appRoot)) {
    if (inFixtures(file) || isSkipped(file, skips)) continue
    const buffer = read(file)
    if (isBinary(buffer)) continue
    for (const { line, codePoint } of suspectCharacters(buffer.toString('utf8'))) {
      findings.push({ file, line, message: `${hex(codePoint)} ${NAMES.get(codePoint)} (CLA-0071)` })
    }
  }
  return reportFindings(findings, { heading: 'Invisible or bidirectional control characters found (CLA-0071):', env, log, error })
}
