import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { generateBaseApp, newWorkFolder } from './base-app.mjs'
import { containerRuntimeAnswers } from './no-docker.mjs'
import { spawnArguments } from '../../../tools/registry.mjs'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const SKIPPED = new Set(['node_modules', 'bin', 'obj', '.git'])

export function run(command, args, cwd, { timeoutMs = 600000, env } = {}) {
  const started = Date.now()
  const [file, list, spawnOptions] = spawnArguments(command, args, cwd)
  const result = spawnSync(file, list, {
    ...spawnOptions,
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...env },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return { ok: result.status === 0, status: result.status, output, ms: Date.now() - started }
}

export function addCases(app) {
  const backend = join(app, 'backend')
  cpSync(join(fixtures, 'csharp'), backend, { recursive: true })
  const slnx = join(backend, 'Proof.slnx')
  const text = readFileSync(slnx, 'utf8')
  writeFileSync(
    slnx,
    text.replace(
      '</Solution>',
      '  <Project Path="Proof.LspCases/Proof.LspCases.csproj" />\n  <Project Path="Proof.LspCases.Tests/Proof.LspCases.Tests.csproj" />\n</Solution>',
    ),
  )
  const architecture = join(backend, 'Proof.ArchitectureTests', 'Proof.ArchitectureTests.csproj')
  writeFileSync(
    architecture,
    readFileSync(architecture, 'utf8').replace('</Project>', '  <ItemGroup>\n    <ProjectReference Include="../Proof.LspCases/Proof.LspCases.csproj" />\n  </ItemGroup>\n</Project>'),
  )
  cpSync(join(fixtures, 'frontend'), join(app, 'frontend'), { recursive: true })
}

export async function ensureBase() {
  const configured = process.env.LSP_HOST_WORK
  if (configured) mkdirSync(configured, { recursive: true })
  const work = configured ? realpathSync.native(configured) : newWorkFolder()
  const provided = process.env.LSP_HOST_BASE_APP
  const base = provided && existsSync(provided) ? realpathSync.native(provided) : join(work, 'base')
  const ready = join(base, '.lsp-host-ready')
  if (!existsSync(ready)) {
    if (base === join(work, 'base')) rmSync(base, { recursive: true, force: true })
    if (!existsSync(base)) await generateBaseApp(work)
    if (!existsSync(join(base, 'backend', 'Proof.LspCases'))) addCases(base)
    await warmBase(base)
    writeFileSync(ready, '')
  }
  return { work, base }
}

export function caseFolder(work, name) {
  mkdirSync(join(work, 'cases'), { recursive: true })
  return mkdtempSync(join(work, 'cases', `${name}-`))
}

export function copyFresh(base, destination) {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  for (const folder of ['backend', 'frontend']) {
    cpSync(join(base, folder), join(destination, folder), {
      recursive: true,
      filter: (source) => !SKIPPED.has(source.split(/[\\/]/).pop()),
    })
  }
  symlinkSync(join(base, 'frontend', 'node_modules'), join(destination, 'frontend', 'node_modules'), 'junction')
  return destination
}

export function cleanFrontend(app) {
  rmSync(join(app, 'frontend', 'node_modules', '.tmp'), { recursive: true, force: true })
}

export function buildBackend(app) {
  return run('dotnet', ['build', join('backend', 'Proof.slnx'), '--nologo', '-v', 'q'], app)
}

export const needsContainer = (source) => /PostgresServer.Create(Migrated)?DatabaseAsync/.test(source)

function sourcesOf(folder) {
  const found = []
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue
    const path = join(folder, entry.name)
    if (entry.isDirectory()) found.push(...sourcesOf(path))
    else if (entry.name.endsWith('.cs')) found.push(path)
  }
  return found
}

export function testProjects(app) {
  const backend = join(app, 'backend')
  return readdirSync(backend, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('Tests') && existsSync(join(backend, entry.name, `${entry.name}.csproj`)))
    .map((entry) => ({ name: entry.name, needsContainer: sourcesOf(join(backend, entry.name)).some((file) => needsContainer(readFileSync(file, 'utf8'))) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

let containers
export const containersAvailable = () => (containers ??= containerRuntimeAnswers())

export function testBackend(app, { available = containersAvailable() } = {}) {
  const ran = []
  const skipped = []
  const started = Date.now()
  for (const project of testProjects(app)) {
    if (project.needsContainer && !available) {
      skipped.push(project.name)
      continue
    }
    const result = run('dotnet', [join('backend', project.name, 'bin', 'Debug', 'net10.0', `${project.name}.dll`)], app)
    ran.push(project.name)
    if (!result.ok) return { ok: false, output: `${project.name}: ${result.output}`, ran, skipped, ms: Date.now() - started }
  }
  return { ok: true, output: '', ran, skipped, ms: Date.now() - started }
}

export function buildFrontend(app) {
  cleanFrontend(app)
  return run('npm', ['run', 'typecheck'], join(app, 'frontend'))
}

export function testFrontend(app) {
  return run('npm', ['test'], join(app, 'frontend'))
}

export function verifyBuild(app, language) {
  const build = language === 'csharp' ? buildBackend(app) : buildFrontend(app)
  if (!build.ok) return { ok: false, stage: 'build', output: build.output.slice(-1500), buildMs: build.ms }
  const tests = language === 'csharp' ? testBackend(app) : testFrontend(app)
  const timings = { buildMs: build.ms, testMs: tests.ms, ran: tests.ran ?? [], skipped: tests.skipped ?? [] }
  if (!tests.ok) return { ok: false, stage: 'test', output: tests.output.slice(-1500), ...timings }
  return { ok: true, ...timings }
}

export async function warmBase(base) {
  const restore = run('dotnet', ['restore', join('backend', 'Proof.slnx'), '--verbosity', 'quiet'], base)
  if (!restore.ok) throw new Error(`restore failed: ${restore.output.slice(-800)}`)
  const build = verifyBuild(base, 'csharp')
  if (!build.ok) throw new Error(`the fixture does not build and pass on its own: ${build.output}`)
  const frontend = verifyBuild(base, 'typescript')
  if (!frontend.ok) throw new Error(`the frontend fixture does not pass on its own: ${frontend.output}`)
}

export { newWorkFolder }
