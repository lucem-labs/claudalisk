import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { devConnectionString } from '../environment.mjs'
import { environmentCommand } from '../environment-command.mjs'
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

export const migrate = environmentCommand({
  script: 'migrate.mjs',
  changes: 'migrates the dev databases from this machine',
  options: { project: { type: 'string' } },
  run: async ({ app, appRoot, options, runner, settings }) => {
    const dev = settings('dev')
    const project = options.project ?? findApiProject(appRoot)
    const connections = Object.fromEntries(dev.databases.map((database) => [database.envVar, devConnectionString(app, dev.values, database.name)]))
    await runChecked(runner, 'dotnet', ['run', '--project', project, '--', '--initialize-databases'], {
      cwd: appRoot,
      inherit: true,
      env: connections,
      what: 'Database migration',
    })
  },
})
