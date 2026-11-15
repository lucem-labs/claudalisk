process.noDeprecation = true
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { generateBaseApp, newWorkFolder } from './base-app.mjs'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const SKIPPED = new Set(['node_modules', 'bin', 'obj', '.git'])

export function run(command, args, cwd, { timeoutMs = 600000, env } = {}) {
  const started = Date.now()
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && /^(npm|npx)$/.test(command),
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
  cpSync(join(fixtures, 'frontend'), join(app, 'frontend'), { recursive: true })
}

export async function ensureBase() {
  const wanted = process.env.LSP_HOST_WORK ?? join(tmpdir(), 'lsp-host-work')
  mkdirSync(wanted, { recursive: true })
  const work = realpathSync.native(wanted)
  const provided = process.env.LSP_HOST_BASE_APP
  const base = provided && existsSync(provided) ? realpathSync.native(provided) : join(work, 'base')
  const ready = join(base, '.lsp-host-ready')
  if (!existsSync(ready)) {
    if (!existsSync(base)) await generateBaseApp(work)
    if (!existsSync(join(base, 'backend', 'Proof.LspCases'))) addCases(base)
    await warmBase(base)
    writeFileSync(ready, '')
  }
  return { work, base }
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
  return run('dotnet', ['build', join('backend', 'Proof.LspCases.Tests'), '--nologo', '-v', 'q'], app)
}

export function testBackend(app) {
  return run('dotnet', [join('backend', 'Proof.LspCases.Tests', 'bin', 'Debug', 'net10.0', 'Proof.LspCases.Tests.dll')], app)
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
  if (!build.ok) return { ok: false, stage: 'build', output: build.output.slice(-1500) }
  const tests = language === 'csharp' ? testBackend(app) : testFrontend(app)
  if (!tests.ok) return { ok: false, stage: 'test', output: tests.output.slice(-1500) }
  return { ok: true }
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
