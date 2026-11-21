import { join } from 'node:path'
import { startUntilLogged } from './processes.mjs'

export const VITE_LISTENING = /Local:\s+(?<url>https?:\/\/\S+)/

export async function startVite({ frontend, port, apiUrl }) {
  const vite = await startUntilLogged({
    name: 'Vite',
    command: process.execPath,
    args: [join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    options: { cwd: frontend, env: { ...process.env, NO_COLOR: '1', E2E_API_URL: apiUrl } },
    ready: VITE_LISTENING,
  })
  return { ...vite, url: new URL(vite.url).origin }
}
