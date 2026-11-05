import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { assertHandRun, parseOptions } from '../cli.mjs'
import { readApp } from '../app-config.mjs'
import { devConnectionString, loadEnvironment } from '../environment.mjs'
import { runChecked } from '../process.mjs'

export function findApiProject(appRoot) {
  const backend = join(appRoot, 'backend')
  const found = existsSync(backend)
    ? readdirSync(backend, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.Api') && existsSync(join(backend, entry.name, `${entry.name}.csproj`)))
      .map((entry) => join('backend', entry.name, `${entry.name}.csproj`))
    : []
  if (found.length !== 1) {
    throw new Error(`Found ${found.length} API projects at backend/<Name>.Api/<Name>.Api.csproj; pass --project <path to the csproj>.`)
  }
  return found[0]
}

export async function migrate({ appRoot, argv, env, runner }) {
  assertHandRun('migrate.mjs', 'migrates the dev databases from this machine', env)
  const options = parseOptions({ project: { type: 'string' } }, argv)
  const app = readApp(appRoot)
  const dev = loadEnvironment('dev', { app, env })
  const project = options.project ?? findApiProject(appRoot)
  const connections = Object.fromEntries(dev.databases.map((database) => [database.envVar, devConnectionString(app, dev.values, database.name)]))
  await runChecked(runner, 'dotnet', ['run', '--project', project, '--', '--initialize-databases'], {
    cwd: appRoot,
    inherit: true,
    env: connections,
    what: 'Database migration',
  })
}
