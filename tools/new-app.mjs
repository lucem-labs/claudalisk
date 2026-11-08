#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addDesignSystem, runCommand } from './add-design-system.mjs'
import { readAppConfig, validateAppConfig } from './app-config.mjs'
import { allocatePorts, readRegistry } from './app-registry.mjs'
import { proxyProblem } from './proxy.mjs'
import { stacksServing } from './runners.mjs'
import { generateBackend } from './scaffold.mjs'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_TEMPLATE = join(PLUGIN_ROOT, 'templates', 'app')
const COPIED_BY_THE_BACKEND = ['backend', 'global.json']
const VERBATIM = /package-lock\.json$/
const APP_NAME = /^[a-z0-9][a-z0-9-]*$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export const LABELS = [
  { name: 'epic', color: '3E4B9E', description: 'A tracking issue that groups other issues' },
  { name: 'needs-design-review', color: 'D93F0B', description: 'The owner has to settle the design before work starts' },
]

const readLf = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const applyTokens = (text, tokens) => Object.entries(tokens).reduce((result, [token, value]) => result.replaceAll(`<${token}>`, value), text)
const databaseName = (text) => text.replace(/-/g, '_')

export function appTokens({ root, name, repo }) {
  return { Root: root, AppName: name, AppRepo: repo, AppDatabase: databaseName(name) }
}

export function isPortFree(port) {
  return new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(false))
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)))
  })
}

export async function choosePorts(registry, { isFree = isPortFree } = {}) {
  let devDbBase = 5433
  let apiLocalBase = 5100
  for (;;) {
    const ports = allocatePorts(registry, { devDbBase, apiLocalBase })
    const devDbFree = await isFree(ports.devDb)
    const apiLocalFree = await isFree(ports.apiLocal)
    if (devDbFree && apiLocalFree) return ports
    if (!devDbFree) devDbBase = ports.devDb + 1
    if (!apiLocalFree) apiLocalBase = ports.apiLocal + 1
  }
}

export function appConfig(template, { name, repo, ports }) {
  return {
    ...template,
    name,
    hostPrefix: name,
    repo,
    ports,
    uat: { ...template.uat, composeProject: `${name}-uat`, volume: `${name}-uat-data` },
  }
}

function copyAppTemplate(target, tokens) {
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const source = join(folder, entry)
      const path = relative(APP_TEMPLATE, source)
      if (COPIED_BY_THE_BACKEND.includes(path) || entry === 'node_modules' || entry === 'dist') continue
      if (statSync(source).isDirectory()) {
        walk(source)
        continue
      }
      const output = join(target, path)
      mkdirSync(dirname(output), { recursive: true })
      if (VERBATIM.test(entry)) cpSync(source, output)
      else writeFileSync(output, applyTokens(readLf(source), tokens))
    }
  }
  walk(APP_TEMPLATE)
}

function validateNames({ name, repo }) {
  if (!APP_NAME.test(name ?? '')) throw new Error(`The app name must match ${APP_NAME}, got '${name ?? ''}'.`)
  if (!REPOSITORY.test(repo ?? '')) throw new Error(`The repository must be owner/name, got '${repo ?? ''}'.`)
}

function scriptsVersion() {
  return JSON.parse(readFileSync(join(APP_TEMPLATE, 'package.json'), 'utf8')).devDependencies['@claudalisk/scripts']
}

export function isPublished(version, spawn = execFileSync) {
  try {
    const shell = process.platform === 'win32'
    return spawn('npm', ['view', `@claudalisk/scripts@${version}`, 'version'], { encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version
  } catch {
    return false
  }
}

export function hasGitIdentity(spawn = execFileSync) {
  try {
    for (const role of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) spawn('git', ['var', role], { cwd: tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return true
  } catch {
    return false
  }
}

export async function generateApp(
  { target, root, name, repo, module, aggregate, plural, registry, skill = true, scriptsPackage, now, gitName, gitEmail },
  { run = runCommand, home = homedir(), log = console.log, isFree, design = addDesignSystem, published = isPublished, identity = hasGitIdentity } = {},
) {
  validateNames({ name, repo })
  if (Boolean(gitName) !== Boolean(gitEmail)) throw new Error('Pass --git-name and --git-email together.')
  if (existsSync(target) && readdirSync(target).length > 0) throw new Error(`${target} is not empty.`)
  const machine = readRegistry({ home })
  if (machine.apps.some((app) => app.name === name)) throw new Error(`An app named ${name} is already registered on this machine.`)
  const version = scriptsVersion()
  if (!scriptsPackage && !published(version)) {
    throw new Error(`@claudalisk/scripts ${version} is not on npm, so the app's root install would fail. Approve the staged package on npmjs.com, then generate the app again.`)
  }
  if (!gitName && !identity()) {
    throw new Error('Git has no identity for the first commit on this machine. Pass --git-name and --git-email, which are set only in the new repository.')
  }
  const ports = await choosePorts(machine, isFree ? { isFree } : {})

  mkdirSync(target, { recursive: true })
  copyAppTemplate(target, appTokens({ root, name, repo }))
  generateBackend({ target, root, module, aggregate, plural, now })
  log(`Generated backend/${root}.slnx.`)

  const configPath = join(target, '.claude', 'claudalisk.json')
  const config = appConfig(JSON.parse(readFileSync(configPath, 'utf8')), { name, repo, ports })
  const invalid = validateAppConfig(config)
  if (invalid.length) throw new Error(`The generated config is invalid: ${invalid.join('; ')}`)
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  log(`Dev database on ${ports.devDb}, local API on ${ports.apiLocal}.`)

  const frontend = join(target, 'frontend')
  await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], frontend)
  await design({ app: frontend, registry, skill }, { run, log })
  await run('npm', ['run', 'api:types'], frontend)

  if (scriptsPackage) {
    const manifestPath = join(target, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.devDependencies['@claudalisk/scripts'] = `file:${scriptsPackage}`
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  await run('npm', ['install', '--ignore-scripts', '--package-lock-only', '--no-audit', '--no-fund'], target)

  await run('git', ['init', '--quiet', '--initial-branch=main'], target)
  if (gitName) {
    await run('git', ['config', 'user.name', gitName], target)
    await run('git', ['config', 'user.email', gitEmail], target)
  }
  await run('git', ['add', '--all'], target)
  await run('git', ['commit', '--quiet', '--message', `Generate ${name} from claudalisk`], target)
  log(`Generated ${name} in ${target}.`)
  return config
}

const RUNNERS_TOOL = join(PLUGIN_ROOT, 'tools', 'runners.mjs')

export function finishSteps(appRoot, config, { node = process.execPath, enrol = true } = {}) {
  const labels = LABELS.map(({ name, color, description }) => ({
    title: `Create the label ${name}`,
    command: 'gh',
    args: ['label', 'create', name, '--repo', config.repo, '--color', color, '--description', description, '--force'],
  }))
  return [
    { title: `Create the private repository ${config.repo} and push main`, command: 'gh', args: ['repo', 'create', config.repo, '--private', '--source', appRoot, '--remote', 'origin', '--push'] },
    ...labels,
    { title: 'Register the app in the machine-wide registry', command: node, args: [join(PLUGIN_ROOT, 'tools', 'app-registry.mjs'), 'register', appRoot] },
    ...(enrol ? [{ title: 'Enrol the repository with the CI runners', command: node, args: [RUNNERS_TOOL, 'enroll', appRoot] }] : []),
  ]
}

export function enrolmentProblem(repo, { home = homedir() } = {}) {
  const count = stacksServing(readRegistry({ home }).runners, repo).length
  if (count === 1) return null
  if (count > 1) return `${count} registered runner stacks serve ${repo}, so enrolment cannot choose one. Remove the extra one from the registry, or add --no-enrol to publish without enrolling.`
  return `No registered runner stack serves ${repo}. If its stack is already running, register it with: node "${RUNNERS_TOOL}" adopt <its config folder>. Otherwise set one up with the runners skill, or add --no-enrol to publish without enrolling.`
}

export async function finishApp({ appRoot, dryRun, enrol = true }, { run = runCommand, log = console.log, home = homedir(), checkProxy = proxyProblem } = {}) {
  const config = readAppConfig(appRoot)
  if (!config) throw new Error(`${join(appRoot, '.claude', 'claudalisk.json')} is missing.`)
  const proxy = checkProxy()
  log(proxy ? `Warning: ${proxy}` : 'The shared proxy is running.')
  const problem = enrol ? enrolmentProblem(config.repo, { home }) : null
  if (problem && !dryRun) throw new Error(`${problem} Nothing was changed.`)
  if (problem) log(`Warning: ${problem}`)
  const steps = finishSteps(appRoot, config, { enrol })
  for (const [index, step] of steps.entries()) {
    log(`${index + 1}/${steps.length} ${step.title}: ${[step.command, ...step.args].join(' ')}`)
    if (!dryRun) await run(step.command, step.args, appRoot)
  }
  if (!enrol) log(`Not enrolled with the CI runners, so CI jobs queue without running. Enrol it with: node "${RUNNERS_TOOL}" enroll ${appRoot}`)
  return steps
}

export function parseArguments(argv) {
  const positional = []
  const options = {}
  const flags = new Set(['dry-run', 'no-skill', 'no-enrol'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) positional.push(argument)
    else if (flags.has(argument.slice(2))) options[argument.slice(2)] = true
    else {
      options[argument.slice(2)] = argv[index + 1]
      index += 1
    }
  }
  return { positional, options }
}

const USAGE = `Usage: new-app.mjs generate <folder> --root <Root> --name <name> --repo <owner/name> [--module <Name> --aggregate <Aggregate> [--plural <Plural>]] [--registry <url with {name}>] [--no-skill] [--git-name <name> --git-email <email>]
       new-app.mjs finish <folder> [--dry-run] [--no-enrol]`

export async function main(argv) {
  const { positional: [command, path], options } = parseArguments(argv)
  if (command === 'generate' && path) {
    await generateApp({
      target: resolve(path),
      root: options.root,
      name: options.name,
      repo: options.repo,
      module: options.module,
      aggregate: options.aggregate,
      plural: options.plural,
      registry: options.registry,
      skill: !options['no-skill'],
      gitName: options['git-name'],
      gitEmail: options['git-email'],
    })
    return
  }
  if (command === 'finish' && path) {
    await finishApp({ appRoot: resolve(path), dryRun: Boolean(options['dry-run']), enrol: !options['no-enrol'] })
    return
  }
  throw new Error(USAGE)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
}
