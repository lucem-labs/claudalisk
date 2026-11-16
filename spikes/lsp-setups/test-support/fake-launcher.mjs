import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const server = join(dirname(fileURLToPath(import.meta.url)), 'fake-lsp-server.mjs')

export const hostLaunch = (language, root) => ({
  id: 'fake',
  spec: { command: process.execPath, args: [server, ...(process.env.FAKE_LSP_PULL === '1' ? ['--pull'] : [])], cwd: root },
  afterInitialize: async () => {},
  waitLoaded: async () => {},
})
