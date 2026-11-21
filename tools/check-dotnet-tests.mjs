#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnArguments } from './registry.mjs'

const NO_SUCH_TEST = 'NoTestHasThisName'

export function testTotal(output) {
  const totals = [...output.matchAll(/^\s*total:\s*(\d+)\s*$/gm)]
  return totals.length ? Number(totals.at(-1)[1]) : null
}

export function dotnetTest(app, args) {
  return new Promise((done, reject) => {
    const [file, list, options] = spawnArguments('dotnet', ['test', ...args], app)
    const child = spawn(file, list, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const keep = (stream) => (chunk) => {
      output += chunk
      stream.write(chunk)
    }
    child.stdout.on('data', keep(process.stdout))
    child.stderr.on('data', keep(process.stderr))
    child.on('error', reject)
    child.on('exit', (code) => done({ code, output }))
  })
}

export function ranTests({ code, output }, command) {
  const total = testTotal(output)
  if (code !== 0) throw new Error(`${command} failed with exit code ${code}`)
  if (!total) throw new Error(`${command} exited 0 but reported ${total ?? 'no'} tests`)
  return total
}

export function projectPath(name) {
  return `backend/${name}/${name}.csproj`
}

export async function requireTests(app, args) {
  const command = `dotnet test ${args.join(' ')}`
  const total = ranTests(await dotnetTest(app, args), command)
  console.log(`✓ ${command} ran ${total} tests`)
  return total
}

export async function requireZeroTestsFail(app, project) {
  const args = ['--project', projectPath(project), '--filter-method', NO_SUCH_TEST]
  const { code } = await dotnetTest(app, args)
  if (code === 0) throw new Error(`dotnet test ${args.join(' ')} ran no tests and still exited 0`)
  console.log(`✓ A run of ${project} that finds no tests fails with exit code ${code}`)
}

export async function checkProjects(app, projects) {
  for (const project of projects) await requireTests(app, ['--project', projectPath(project)])
  await requireZeroTestsFail(app, projects[0])
}

async function main() {
  const [app, ...projects] = process.argv.slice(2)
  if (!app || !projects.length) throw new Error('Usage: node tools/check-dotnet-tests.mjs <app> <test project>...')
  await checkProjects(resolve(app), projects)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
}
