#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stubEnvironment, stubs } from '../stubs/index.mjs'
import { apiEnvironment, startApi } from './api.mjs'
import { runProjects } from './playwright-runs.mjs'
import { resolvePorts } from './ports.mjs'
import { startPostgres } from './postgres.mjs'
import { runToEnd, startUntilLogged } from './processes.mjs'
import { startStubs } from './stubs.mjs'

const VITE_READY = /ready in \d/

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const backend = join(frontend, '..', 'backend')

function solutionRoot() {
  const solution = readdirSync(backend).find((entry) => entry.endsWith('.slnx'))
  if (!solution) throw new Error(`No .slnx file in ${backend}.`)
  return solution.slice(0, -'.slnx'.length)
}

function runPlaywright(env) {
  return (project, args) => new Promise((done, reject) => {
    const cli = join(frontend, 'node_modules', '@playwright', 'test', 'cli.js')
    const child = spawn(process.execPath, [cli, ...args], { cwd: frontend, stdio: 'inherit', env: { ...env, E2E_PROJECT: project } })
    child.once('error', reject)
    child.once('close', (code) => done(code ?? 1))
  })
}

async function main(extra) {
  const cleanup = []
  const stopAll = async () => {
    for (const stop of cleanup.splice(0).reverse()) await stop().catch((error) => console.error(error.message))
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => stopAll().finally(() => process.exit(1)))
  }

  try {
    const ports = await resolvePorts(['E2E_API_PORT', 'E2E_WEB_PORT', 'E2E_STUB_PORT'])
    const postgresPort = process.env.E2E_POSTGRES_PORT ? (await resolvePorts(['E2E_POSTGRES_PORT'])).E2E_POSTGRES_PORT : undefined

    const output = mkdtempSync(join(tmpdir(), 'e2e-api-'))
    cleanup.push(async () => rmSync(output, { recursive: true, force: true }))
    const root = solutionRoot()
    await runToEnd('dotnet', ['build', join(backend, `${root}.Api`, `${root}.Api.csproj`), '-nodeReuse:false', '-o', output], { cwd: join(backend, '..') })
    const dll = join(output, `${root}.Api.dll`)

    const postgres = await startPostgres(postgresPort)
    cleanup.push(postgres.stop)

    const stubServer = await startStubs(stubs, ports.E2E_STUB_PORT)
    cleanup.push(stubServer.stop)
    const extraEnv = stubEnvironment(stubServer.url)

    await runToEnd('dotnet', [dll, '--initialize-databases'], {
      env: apiEnvironment({ connectionString: postgres.connectionString, port: ports.E2E_API_PORT, workers: false, extra: extraEnv }),
    })

    const api = await startApi({ dll, connectionString: postgres.connectionString, port: ports.E2E_API_PORT, workers: false, extra: extraEnv })
    cleanup.push(api.stop)

    const vite = await startUntilLogged({
      name: 'Vite',
      command: process.execPath,
      args: [join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(ports.E2E_WEB_PORT), '--strictPort'],
      options: { cwd: frontend, env: { ...process.env, NO_COLOR: '1', E2E_API_URL: `http://127.0.0.1:${ports.E2E_API_PORT}` } },
      ready: VITE_READY,
    })
    cleanup.push(vite.stop)

    return await runProjects(runPlaywright({
      ...process.env,
      E2E_WEB_PORT: String(ports.E2E_WEB_PORT),
      E2E_API_PORT: String(ports.E2E_API_PORT),
      E2E_API_DLL: dll,
      E2E_CONNECTION_STRING: postgres.connectionString,
      E2E_API_EXTRA_ENV: JSON.stringify(extraEnv),
    }), extra)
  } finally {
    await stopAll()
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code },
  (error) => {
    console.error(error.message)
    process.exitCode = 1
  },
)
