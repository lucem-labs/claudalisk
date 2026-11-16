import { serveStdio } from '../lib/mcp.mjs'
import { Workspace } from '../lib/workspace.mjs'
import { readTools, tools } from './tools.mjs'

const readOnly = process.argv.includes('--read-only')
const workspace = new Workspace()

serveStdio({
  name: readOnly ? 'code-intel-c-read' : 'code-intel-c',
  tools: readOnly ? readTools : tools,
  workspace: () => workspace,
  onClose: async () => {
    await workspace.stop()
    process.exit(0)
  },
})
