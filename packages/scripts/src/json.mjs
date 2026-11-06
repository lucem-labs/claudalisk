const shortEscapes = new Map([
  ['"', '\\"'],
  ['\\', '\\\\'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\t', '\\t'],
])

const escaped = /[\p{Cc}\p{Cn}\p{Co}\p{Cs}\p{Zl}\p{Zp}"\x5c\u{FEFF}]|(?! )\p{Zs}|[^\0-\u{FFFF}]/gu

function escapeUnit(code) {
  return '\\' + 'u' + code.toString(16).toUpperCase().padStart(4, '0')
}

function escapeCharacter(character) {
  const short = shortEscapes.get(character)
  if (short) return short
  return Array.from({ length: character.length }, (_, index) => escapeUnit(character.charCodeAt(index))).join('')
}

export function jsonString(text) {
  return `"${text.replace(escaped, escapeCharacter)}"`
}

export class RawNumber {
  constructor(text) {
    this.text = text
  }

  valueOf() {
    return Number(this.text)
  }
}

export function parseJsonKeepingNumbers(text) {
  return JSON.parse(text, (key, value, context) => (typeof value === 'number' ? new RawNumber(context.source) : value))
}

function scalar(value) {
  if (value === null || value === undefined) return 'null'
  if (value instanceof RawNumber) return value.text
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return jsonString(value)
  return undefined
}

export function compactJson(value) {
  const text = scalar(value)
  if (text !== undefined) return text
  if (Array.isArray(value)) return `[${value.map(compactJson).join(',')}]`
  return `{${Object.entries(value)
    .map(([key, item]) => `${jsonString(key)}:${compactJson(item)}`)
    .join(',')}}`
}

export function indentedJson(value, indent = ' ', depth = 0) {
  const text = scalar(value)
  if (text !== undefined) return text
  const inner = indent.repeat(depth + 1)
  const outer = indent.repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((item) => inner + indentedJson(item, indent, depth + 1)).join(',\n')}\n${outer}]`
  }
  const entries = Object.entries(value)
  if (entries.length === 0) return '{}'
  return `{\n${entries.map(([key, item]) => `${inner}${jsonString(key)}: ${indentedJson(item, indent, depth + 1)}`).join(',\n')}\n${outer}}`
}
