import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'
import { createManifest, writeManifest } from '../src/backups.mjs'
import { fakeRunner } from '../src/fake-runner.mjs'
import { sampleConfig } from './sample-app.mjs'

const created = []
after(() => {
  for (const folder of created) rmSync(folder, { recursive: true, force: true })
})

export function temporaryFolder(prefix) {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  created.push(folder)
  return folder
}

export const sha = '1234567890abcdef1234567890abcdef12345678'

export function makeApp({ config = sampleConfig } = {}) {
  const root = temporaryFolder('shop-app-')
  const state = temporaryFolder('shop-state-')
  mkdirSync(join(root, '.claude'), { recursive: true })
  mkdirSync(join(root, 'backend'), { recursive: true })
  writeFileSync(join(root, '.claude', 'claudalisk.json'), JSON.stringify(config))
  writeFileSync(join(root, '.env.dev.example'), 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=CHANGE_ME\n')
  writeFileSync(join(root, '.env.uat.example'), 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=CHANGE_ME\n')
  const env = { CLAUDALISK_APP_STATE: state, CI: '', GITHUB_ACTIONS: '' }
  return { root, state, env }
}

export function writeEnvFile(state, environment, text = 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\n') {
  mkdirSync(state, { recursive: true })
  writeFileSync(join(state, `${environment}.env`), text)
}

export function writeBackup(state, name, { createdAt, migrations = [], reason = 'deploy', database = 'shop', role = 'app' } = {}) {
  const folder = join(state, 'backups', name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, `${database}.dump`), 'dump')
  writeManifest(folder, createManifest({
    environment: 'uat',
    reason,
    createdAt: new Date(createdAt),
    databases: [{ role, database, file: `${database}.dump`, sizeBytes: 4, sha256: createHash('sha256').update('dump').digest('hex') }],
    migrations,
  }))
  return folder
}

export function docker({
  state,
  volumes = [],
  networks = ['traefik'],
  proxyRunning = true,
  dbRunning = true,
  hasSchema = true,
  applied = [],
  apiEnv = `DEPLOYED_SHA=${sha}\nDEPLOYED_REF=feature\n`,
  dirty = false,
  branch = 'feature',
  head = sha,
  failOn = [],
  extra = () => undefined,
} = {}) {
  const volumeSet = new Set(volumes)
  const networkSet = new Set(networks)
  return fakeRunner((call) => {
    const { command, args, line } = call
    const text = args.join(' ')
    for (const needle of failOn) if (line.includes(needle)) return { code: 1, stderr: `${needle} failed` }
    const custom = extra(call)
    if (custom) return custom
    if (command === 'git') {
      if (text.includes('branch --show-current')) return { stdout: branch ? `${branch}\n` : '' }
      if (text.includes('rev-parse HEAD')) return { stdout: `${head}\n` }
      if (text.includes('status --porcelain')) return { stdout: dirty ? ' M file\n' : '' }
      return {}
    }
    if (command === 'gh') return text.includes('/deployments') && !text.includes('/statuses') ? { stdout: '{"id":7}' } : {}
    if (command === 'dotnet') return {}
    if (text.startsWith('volume ls')) {
      const name = args.at(-1).slice(6, -1)
      return { stdout: volumeSet.has(name) ? `${name}\n` : '' }
    }
    if (text.startsWith('volume create')) volumeSet.add(args[2])
    if (text.startsWith('volume rm')) volumeSet.delete(args[2])
    if (text.startsWith('network ls')) return { stdout: networkSet.has('traefik') ? 'n1\n' : '' }
    if (text.startsWith('network create')) networkSet.add(args[2])
    if (args[0] === 'ps') return { stdout: proxyRunning ? 'p1\n' : '' }
    if (args[0] === 'compose' && args.includes('ps')) {
      if (args.includes('db')) return { stdout: dbRunning ? 'db1\n' : '' }
      if (args.includes('api')) return { stdout: apiEnv ? 'api1\n' : '' }
    }
    if (args[0] === 'inspect') return { stdout: apiEnv }
    if (args[0] === 'image') return { code: 1 }
    const sql = call.options.input ?? ''
    if (sql.includes('SELECT EXISTS')) return { stdout: hasSchema ? 't\n' : 'f\n' }
    if (sql.includes('gexec')) return { stdout: applied.join('\n') }
    if (text.includes('pg_dump')) {
      writeFileSync(join(state, 'backups', args.at(-1).replace('/backups/', '')), `dump-${args.at(-2)}`)
      return {}
    }
    if (text.includes('pg_restore --list')) return { stdout: '1; 0 0 TABLE x\n' }
    return {}
  })
}

export const callsMatching = (runner, pattern) => runner.calls.filter((call) => pattern.test(call.line))
