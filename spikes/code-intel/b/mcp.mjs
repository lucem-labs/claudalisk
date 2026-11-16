import { serveStdio } from '../lib/mcp.mjs'
import { Workspace } from '../lib/workspace.mjs'
import { tools } from './tools.mjs'

const workspace = new Workspace()

serveStdio({
  name: 'code-intel-b',
  tools,
  workspace: () => workspace,
  onClose: async () => {
    await workspace.stop()
    process.exit(0)
  },
})
