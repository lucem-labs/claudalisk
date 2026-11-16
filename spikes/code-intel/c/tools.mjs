import { CodeIntelError } from '../lib/errors.mjs'
import { callTool, inputFromArguments, string } from '../lib/tool.mjs'
import { resolveName } from '../lib/symbols.mjs'
import { tools as symbolTools } from '../b/tools.mjs'
import { runSnippet } from './sandbox.mjs'

export const CI_OPS = [...symbolTools.map((t) => t.name), 'matches']
export const CI_READ_OPS = [...symbolTools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name), 'matches']

export function bridge(workspace, ops = CI_OPS) {
  return async (op, args) => {
    if (!ops.includes(op)) throw new CodeIntelError(`unknown operation ${op}`)
    if (op === 'matches') {
      const { candidates } = await resolveName(workspace, args[0])
      return candidates.map((c) => ({ name: c.name, qualified: c.qualified, kind: c.kind, path: c.path, line: c.line }))
    }
    const tool = symbolTools.find((t) => t.name === op)
    return callTool(tool, workspace, inputFromArguments(tool, args))
  }
}

const SNIPPET = 'Run a short JavaScript snippet (async function body) with `ci` and `print`. '
const READS = 'ci.find|definition|implementations|callers|callees|references|diagnostics(name)'
const MATCHES = 'ci.matches(name) returns [{qualified,kind,path,line}]. print() and the return value come back.'

const runTool = ({ ops, description, readOnly }) => ({
  name: 'run',
  description,
  params: [string('code', 'JavaScript statements; use await, print(...) and return')],
  annotations: { readOnlyHint: readOnly },
  run: (ws, i) => runSnippet(i.code, { call: bridge(ws, ops), ops }),
})

export const tools = [
  runTool({
    ops: CI_OPS,
    readOnly: false,
    description: `${SNIPPET}${READS}, ci.rename(name,newName), ci.replaceBody(name,body) return text; ${MATCHES}`,
  }),
]

export const readTools = [
  runTool({
    ops: CI_READ_OPS,
    readOnly: true,
    description: `${SNIPPET}${READS} return text; ${MATCHES} It cannot edit files.`,
  }),
]
