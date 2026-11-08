#!/usr/bin/env node
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'
import ts from 'typescript'
import { apiEnvironment, startApi } from '../e2e/harness/api.mjs'
import { freePorts } from '../e2e/harness/ports.mjs'
import { startPostgres } from '../e2e/harness/postgres.mjs'
import { runToEnd } from '../e2e/harness/processes.mjs'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(frontend, '..', 'backend')
const output = join(frontend, 'src', 'shared', 'api', 'schema.d.ts')

const solution = readdirSync(backend).find((entry) => entry.endsWith('.slnx'))
if (!solution) throw new Error(`No .slnx file in ${backend}.`)
const root = solution.slice(0, -'.slnx'.length)

const withoutComments = (text) => {
  const source = ts.createSourceFile('schema.d.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(source)
}

const build = mkdtempSync(join(tmpdir(), 'api-types-'))
let api
let postgres
try {
  await runToEnd('dotnet', ['build', join(backend, `${root}.Api`, `${root}.Api.csproj`), '-nodeReuse:false', '-o', build], { cwd: join(backend, '..') })
  const dll = join(build, `${root}.Api.dll`)
  postgres = await startPostgres()
  const [port] = await freePorts(1)
  const settings = { connectionString: postgres.connectionString, port, workers: false }
  await runToEnd('dotnet', [dll, '--initialize-databases'], { env: apiEnvironment(settings) })
  api = await startApi({ dll, ...settings })
  const response = await fetch(`http://127.0.0.1:${port}/openapi/v1.json`)
  if (!response.ok) throw new Error(`/openapi/v1.json returned ${response.status}.`)
  const document = await response.json()
  writeFileSync(output, withoutComments(astToString(await openapiTS(document))))
  console.log(`Wrote ${output} with ${Object.keys(document.paths ?? {}).length} paths.`)
} finally {
  await api?.stop()
  await postgres?.stop()
  rmSync(build, { recursive: true, force: true })
}
