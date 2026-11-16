import { rootFromEnvironment } from './workspace.mjs'
import { request } from './daemon.mjs'
import { inputFromArguments, usage } from './tool.mjs'

export function help(name, tools) {
  return [`usage: node ${name}/cli.mjs <operation> <arguments...>`, ...tools.map((tool) => `  ${usage(tool)}`), '  stop'].join('\n')
}

export async function runCli(name, tools, argv, { root = rootFromEnvironment(), send = request, out = (text) => process.stdout.write(`${text}\n`), err = (text) => process.stderr.write(`${text}\n`) } = {}) {
  const [operation, ...args] = argv
  if (!operation || operation === 'help' || operation === '--help') {
    out(help(name, tools))
    return 0
  }
  if (operation === 'stop') {
    out((await send(root, { op: 'stop' })).text)
    return 0
  }
  const tool = tools.find((t) => t.name === operation)
  if (!tool) {
    err(`unknown operation ${operation}\n${help(name, tools)}`)
    return 2
  }
  const required = tool.params.filter((p) => !p.optional).length
  if (args.length < required) {
    err(`usage: ${usage(tool)}`)
    return 2
  }
  const response = await send(root, { op: 'call', interface: name, tool: tool.name, input: inputFromArguments(tool, args) })
  ;(response.ok ? out : err)(response.text)
  return response.ok ? 0 : 1
}
