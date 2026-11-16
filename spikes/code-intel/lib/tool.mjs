import { CodeIntelError } from './errors.mjs'

export const string = (name, description, optional = false) => ({ name, type: 'string', description, optional })
export const integer = (name, description) => ({ name, type: 'integer', description })

export function inputSchema(tool) {
  return {
    type: 'object',
    properties: Object.fromEntries(tool.params.map((p) => [p.name, { type: p.type, description: p.description }])),
    required: tool.params.filter((p) => !p.optional).map((p) => p.name),
  }
}

export function usage(tool) {
  return `${tool.name} ${tool.params.map((p) => (p.optional ? `[${p.name}]` : `<${p.name}>`)).join(' ')}`.trim()
}

export function coerce(tool, input) {
  const clean = {}
  for (const param of tool.params) {
    const value = input?.[param.name]
    if (value === undefined || value === null || value === '') {
      if (!param.optional) throw new CodeIntelError(`missing ${param.name}; usage: ${usage(tool)}`)
      continue
    }
    if (param.type === 'integer') {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isInteger(number)) throw new CodeIntelError(`${param.name} must be an integer`)
      clean[param.name] = number
    } else {
      clean[param.name] = String(value)
    }
  }
  return clean
}

export function inputFromArguments(tool, args) {
  const input = {}
  tool.params.forEach((param, index) => {
    if (index === tool.params.length - 1 && args.length > tool.params.length) input[param.name] = args.slice(index).join(' ')
    else if (args[index] !== undefined) input[param.name] = args[index]
  })
  return input
}

export const callTool = (tool, workspace, input) => tool.run(workspace, coerce(tool, input))
