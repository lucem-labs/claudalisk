#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, runAsync } from './check-registry.mjs'
import { generateApp, finishApp } from './new-app.mjs'
import { builtRegistry, readJson, repositoryRoot, spawnArguments } from './registry.mjs'

const ROOT = 'Proof'
const NAME = 'proof-app'

const INSTALL = ['ci', '--ignore-scripts', '--no-audit', '--no-fund']

function output(command, args, cwd, env) {
  return new Promise((done, reject) => {
    const [file, list, options] = spawnArguments(command, args, cwd)
    const child = spawn(file, list, { ...options, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } })
    let text = ''
    child.stdout.on('data', (chunk) => { text += chunk })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? done(text) : reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))))
  })
}

async function step(title, action) {
  console.log(`\n▶ ${title}`)
  await action()
  console.log(`✓ ${title}`)
}

export function missingServices(listed, expected) {
  const services = listed.split(/\r?\n/).map((line) => line.trim())
  return expected.filter((service) => !services.includes(service))
}

async function checkCompose(app, work) {
  for (const environment of ['dev', 'uat']) {
    const envFile = join(work, `${environment}.env`)
    const example = readFileSync(join(app, `.env.${environment}.example`), 'utf8')
    writeFileSync(envFile, `${example.replaceAll('CHANGE_ME', 'proof')}DEV_POSTGRES_PORT=5999\n`)
    const env = { APP_ENV_FILE: envFile, BACKUP_DIR: join(work, 'backups') }
    const base = ['compose', '--project-name', `${NAME}-check-${environment}`, '--project-directory', app, '-f', join(app, 'compose.base.yml'), '-f', join(app, `compose.${environment}.yml`), '--env-file', envFile]
    const listed = await output('docker', [...base, '--profile', 'migrate', 'config', '--services'], app, env)
    const missing = missingServices(listed, ['api', 'db', 'migrate', 'web'])
    if (missing.length) throw new Error(`compose.${environment}.yml lacks ${missing.join(', ')}`)
  }
}

async function checkRegistration(app, work) {
  const home = join(work, 'home')
  mkdirSync(home, { recursive: true })
  await output(process.execPath, [join(repositoryRoot, 'tools', 'app-registry.mjs'), 'register', app], app, { HOME: home, USERPROFILE: home })
  const registered = readJson(join(home, '.claudalisk', 'apps.json')).apps.map((entry) => entry.name)
  if (!registered.includes(NAME)) throw new Error(`The stubbed registry lists ${registered.join(', ')}`)
}

async function main() {
  const keep = process.argv.includes('--keep')
  const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'claudalisk-new-app-')))
  const app = join(work, 'app')
  const home = join(work, 'generate-home')
  mkdirSync(home)
  const identity = { GIT_AUTHOR_NAME: 'claudalisk', GIT_AUTHOR_EMAIL: 'claudalisk@example.com', GIT_COMMITTER_NAME: 'claudalisk', GIT_COMMITTER_EMAIL: 'claudalisk@example.com' }
  Object.assign(process.env, identity)
  const server = await serve(builtRegistry)
  try {
    const scripts = join(repositoryRoot, 'packages', 'scripts')
    const { version } = readJson(join(scripts, 'package.json'))
    await runAsync('npm', ['pack', '--pack-destination', work], scripts)
    const scriptsPackage = join(work, `claudalisk-scripts-${version}.tgz`).replaceAll('\\', '/')
    if (!existsSync(scriptsPackage)) throw new Error(`npm pack did not write ${scriptsPackage}`)

    const registry = `http://127.0.0.1:${server.address().port}/{name}.json`
    await step('Generate an app with one module', () => generateApp(
      { target: app, root: ROOT, name: NAME, repo: `lucem-labs/${NAME}`, module: 'Ordering', aggregate: 'Order', registry, skill: false, scriptsPackage },
      { run: runAsync, home },
    ))

    const frontend = join(app, 'frontend')
    await step('Backend restore, build and tests, architecture tests included', () => runAsync('dotnet', ['test', '--solution', `backend/${ROOT}.slnx`], app))
    await step('Root install', () => runAsync('npm', INSTALL, app))
    await step('Frontend lint and Steiger', () => runAsync('npm', ['run', 'lint:ci'], frontend))
    await step('Frontend typecheck', () => runAsync('npm', ['run', 'typecheck'], frontend))
    await step('Frontend unit tests', () => runAsync('npm', ['test'], frontend))
    await step('Frontend build', () => runAsync('npm', ['run', 'build'], frontend))
    await step('Generated API types are current', async () => {
      await runAsync('npm', ['run', 'api:types'], frontend)
      await runAsync('git', ['diff', '--exit-code', '--', 'src/shared/api/schema.d.ts'], frontend)
    })
    await step('Script tests and source checks', async () => {
      await runAsync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], app)
      await runAsync('node', ['--test', 'scripts/*.test.mjs'], app)
      for (const script of ['no-comments', 'check-forbidden-files', 'check-source-hygiene', 'check-suppressions', 'check-e2e-locators']) {
        await runAsync('node', [`scripts/${script}.mjs`], app)
      }
    })
    await step('Compose files', () => checkCompose(app, work))
    await step('Register in a stubbed machine registry', () => checkRegistration(app, work))
    await step('Finish, dry run', () => finishApp({ appRoot: app, dryRun: true }))
    await step('End-to-end harness against the real frontend', async () => {
      await runAsync('npx', ['playwright', 'install', ...(process.env.CI ? ['--with-deps'] : []), 'chromium'], frontend)
      await runAsync('npm', ['run', 'e2e'], frontend)
    })
    console.log('\n✓ The generated app passes its checks.')
  } finally {
    server.close()
    if (keep) console.log(`Kept ${work}`)
    else rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
}
