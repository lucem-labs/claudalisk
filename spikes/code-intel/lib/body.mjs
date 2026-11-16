import { CodeIntelError } from './errors.mjs'

const EOL = /\r\n|\n|\r/

export function lineStarts(text) {
  const starts = [0]
  const pattern = /\r\n|\n|\r/g
  let match
  while ((match = pattern.exec(text))) starts.push(match.index + match[0].length)
  return starts
}

export function offsetOf(text, position, starts = lineStarts(text)) {
  return Math.min((starts[position.line] ?? text.length) + position.character, text.length)
}

export function positionOf(text, offset, starts = lineStarts(text)) {
  let line = 0
  while (line + 1 < starts.length && starts[line + 1] <= offset) line++
  return { line, character: offset - starts[line] }
}

function skipLiteral(text, i) {
  const quote = text[i]
  if (quote === '/' && text[i + 1] === '/') {
    const end = text.slice(i).search(/\r|\n/)
    return end < 0 ? text.length : i + end
  }
  if (quote === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2)
    return end < 0 ? text.length : end + 1
  }
  if (quote === '"' || quote === "'" || quote === '`') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') j++
      else if (text[j] === quote) return j
    }
    return text.length
  }
  return i
}

export function findBody(declaration, { typeAnnotations = false } = {}) {
  let depth = 0
  let inType = false
  const groupInType = []
  let afterTypeGroup = false
  for (let i = 0; i < declaration.length; i++) {
    const ch = declaration[i]
    const skipped = skipLiteral(declaration, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    const arrow = ch === '=' && declaration[i + 1] === '>'
    if (afterTypeGroup && !/\s/.test(ch) && !arrow) afterTypeGroup = false
    if (ch === '(' || ch === '[') {
      groupInType.push(inType)
      depth++
    } else if (ch === ')' || ch === ']') {
      depth--
      if (groupInType.pop() && depth === 0) afterTypeGroup = true
    } else if (arrow && depth !== 0) i += 1
    else if (inType && ch === '<') depth++
    else if (inType && ch === '>') depth--
    else if (typeAnnotations && depth === 0 && ch === ':') inType = true
    else if (inType && depth === 0 && ch === '=' && !arrow) inType = false
    else if (depth === 0 && arrow && afterTypeGroup) {
      afterTypeGroup = false
      i += 1
    } else if (depth === 0 && arrow) {
      const after = declaration.slice(i + 2)
      const lead = after.length - after.trimStart().length
      if (after.trimStart().startsWith('{')) {
        i += 1 + lead
        continue
      }
      const start = i + 2 + lead
      const end = declaration.replace(/[;\s]+$/, '').length
      if (end <= start) throw new CodeIntelError('the declaration has an empty expression body')
      return { kind: 'expression', start, end }
    } else if (depth === 0 && ch === '{') {
      let nesting = 0
      for (let j = i; j < declaration.length; j++) {
        const inner = skipLiteral(declaration, j)
        if (inner !== j) {
          j = inner
          continue
        }
        if (declaration[j] === '{') nesting++
        else if (declaration[j] === '}' && --nesting === 0) return { kind: 'block', start: i, end: j + 1 }
      }
      throw new CodeIntelError('the braces of the declaration do not balance')
    }
  }
  throw new CodeIntelError('the declaration has no body to replace')
}

export function renderBlock(body, { baseIndent, unit, eol }) {
  const lines = body.split(EOL)
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines.at(-1).trim()) lines.pop()
  const indents = lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)[0].length)
  const strip = indents.length ? Math.min(...indents) : 0
  const inner = lines.map((line) => (line.trim() ? `${baseIndent}${unit}${line.slice(strip)}` : ''))
  return ['{', ...inner, `${baseIndent}}`].join(eol)
}

export function replaceBodyText(text, range, body, { unit, typeAnnotations = false }) {
  const starts = lineStarts(text)
  const from = offsetOf(text, range.start, starts)
  const to = offsetOf(text, range.end, starts)
  const found = findBody(text.slice(from, to), { typeAnnotations })
  const baseIndent = /^[ \t]*/.exec(text.slice(starts[range.start.line]))[0]
  const eol = EOL.exec(text)?.[0] ?? '\n'
  const replacement = found.kind === 'block' ? renderBlock(body, { baseIndent, unit, eol }) : body.trim().replace(/;+$/, '')
  const replaceStart = from + found.start
  const replaceEnd = from + found.end
  return { newText: text.slice(0, replaceStart) + replacement + text.slice(replaceEnd), replaceStart, replaceEnd, replacement, kind: found.kind }
}
