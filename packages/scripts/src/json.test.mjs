import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compactJson, indentedJson, jsonString, parseJsonKeepingNumbers } from './json.mjs'

const u = (hex) => `\\${'u'}${hex}`
const char = (code) => String.fromCodePoint(code)

test('strings are escaped like .NET relaxed JSON escaping', () => {
  const text = `Zoë's ${char(0x201c)}Greeting${char(0x201d)} ${char(0x2014)} <b>&</b> a\tb\nc${char(0x7f)}${char(0xa0)}${char(0x2028)}${char(0x1f600)}\\"`
  assert.equal(
    jsonString(text),
    `"Zoë's ${char(0x201c)}Greeting${char(0x201d)} ${char(0x2014)} <b>&</b> a\\tb\\nc${u('007F')}${u('00A0')}${u('2028')}${u('D83D')}${u('DE00')}\\\\\\""`,
  )
})

test('short escapes and the byte order mark', () => {
  assert.equal(jsonString(`\b\f\r${char(0x1f)}${char(0xfeff)} `), `"\\b\\f\\r${u('001F')}${u('FEFF')} "`)
})

test('numbers keep their source text', () => {
  const value = parseJsonKeepingNumbers('{"cmc":4.0,"rank":12,"big":1e2}')
  assert.equal(Number(value.cmc), 4)
  assert.equal(compactJson(value), '{"cmc":4.0,"rank":12,"big":1e2}')
})

test('compact JSON has no spaces and keeps nulls inside values', () => {
  assert.equal(compactJson(parseJsonKeepingNumbers('{ "a": [1, null, {"b": "x"}], "c": {} }')), '{"a":[1,null,{"b":"x"}],"c":{}}')
})

test('indented JSON matches .NET with an indent size of one', () => {
  const value = parseJsonKeepingNumbers('[{"a":1.0,"b":[],"c":{},"d":[1,{"e":null}],"f":"x"}]')
  assert.equal(indentedJson(value, ' '), ['[', ' {', '  "a": 1.0,', '  "b": [],', '  "c": {},', '  "d": [', '   1,', '   {', '    "e": null', '   }', '  ],', '  "f": "x"', ' }', ']'].join('\n'))
})
