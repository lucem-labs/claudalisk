import { readFileSync } from 'node:fs'

const schema = readFileSync('frontend/src/shared/api/schema.d.ts', 'utf8')

function block(name) {
  const start = schema.indexOf(`        ${name}: {`)
  if (start < 0) throw new Error(`schema.d.ts has no ${name}`)
  const end = schema.indexOf('\n        };', start)
  return schema.slice(start, end)
}

const problems = []
const order = block('OrderResponse')
if (!/^\s+label: string;$/m.test(order)) problems.push('OrderResponse has no label: string')
if (/^\s+name\??:/m.test(order)) problems.push('OrderResponse still has a name')
if (!/^\s+name: string;$/m.test(block('CreateOrderRequest'))) problems.push('CreateOrderRequest lost its name')
if (!/^\s+name: string;$/m.test(block('InvoiceResponse'))) problems.push('InvoiceResponse lost its name')
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
