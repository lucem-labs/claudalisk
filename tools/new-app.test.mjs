import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { validateAppConfig } from './app-config.mjs'
import { missingServices } from './check-new-app.mjs'
import { appConfig, choosePorts, finishApp, finishSteps, generateApp, hasGitIdentity, LABELS } from './new-app.mjs'

const created = []
const folder = () => {
  const path = mkdtempSync(join(tmpdir(), 'new-app-'))
  created.push(path)
  return path
}

afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true })
})

function allFiles(path) {
  return readdirSync(path).flatMap((entry) => {
    const full = join(path, entry)
    return statSync(full).isDirectory() ? allFiles(full) : [full]
  })
}

const NAMES = { root: 'Acme', name: 'acme-shop', repo: 'acme/acme-shop' }

async function generated(overrides = {}, dependencies = {}) {
  const target = join(folder(), 'app')
  const calls = []
  await generateApp(
    { target, ...NAMES, skill: false, scriptsPackage: 'scripts.tgz', ...overrides },
    { run: async (command, args, cwd) => calls.push({ command, args, cwd }), design: async (options) => calls.push({ design: options }), home: folder(), log: () => {}, isFree: async () => true, identity: () => true, ...dependencies },
  )
  return { target, calls }
}

describe('generateApp', () => {
  it('leaves no token of the template in a generated file', async () => {
    const { target } = await generated()
    const token = /<(AppName|AppRepo|AppDatabase|Root)>/
    for (const file of allFiles(target)) assert.doesNotMatch(readFileSync(file, 'utf8'), token, file)
  })

  it('writes a config that validates, with the names and ports it was given', async () => {
    const { target } = await generated()
    const config = JSON.parse(readFileSync(join(target, '.claude', 'claudalisk.json'), 'utf8'))
    assert.deepEqual(validateAppConfig(config), [])
    assert.equal(config.name, 'acme-shop')
    assert.equal(config.hostPrefix, 'acme-shop')
    assert.equal(config.repo, 'acme/acme-shop')
    assert.equal(config.uat.composeProject, 'acme-shop-uat')
    assert.equal(config.uat.volume, 'acme-shop-uat-data')
    assert.deepEqual(config.ports, { devDb: 5433, apiLocal: 5100 })
  })

  it('uses a database name PostgreSQL accepts without quoting', async () => {
    const { target } = await generated()
    assert.match(readFileSync(join(target, '.env.dev.example'), 'utf8'), /^POSTGRES_DB=acme_shop$/m)
  })

  it('writes the files the environment scripts and the skills read', async () => {
    const { target } = await generated()
    for (const file of ['compose.base.yml', 'compose.dev.yml', 'compose.uat.yml', '.env.dev.example', '.env.uat.example', 'AGENTS.md', 'CLAUDE.md', '.gitignore', '.github/dependabot.yml', 'global.json', 'backend/Acme.slnx', 'frontend/src/app/main.tsx', 'frontend/steiger.config.ts']) {
      assert.ok(existsSync(join(target, file)), file)
    }
  })

  it('installs the design system, generates the API types, then commits', async () => {
    const { calls } = await generated()
    const names = calls.map((call) => (call.design ? 'design' : `${call.command} ${call.args[0]}${call.args[1] === 'api:types' ? ' api:types' : ''}`))
    assert.deepEqual(names, ['npm ci', 'design', 'npm run api:types', 'npm install', 'git init', 'git add', 'git commit'])
  })

  it('refuses a folder that is not empty', async () => {
    const target = folder()
    writeFileSync(join(target, 'file'), '')
    await assert.rejects(generateApp({ target, ...NAMES }, { home: folder() }), /not empty/)
  })

  it('refuses a name already in the machine registry', async () => {
    const home = folder()
    await generated({}, { home })
    const entry = { name: 'acme-shop', repo: 'acme/acme-shop', hostPrefix: 'acme-shop', uat: { composeProject: 'p', volume: 'v' }, ports: { devDb: 5433, apiLocal: 5100 } }
    const claudalisk = join(home, '.claudalisk')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(claudalisk)
    writeFileSync(join(claudalisk, 'apps.json'), JSON.stringify({ apps: [entry] }))
    await assert.rejects(generateApp({ target: join(folder(), 'app'), ...NAMES }, { home }), /already registered/)
  })

  it('stops before writing anything when the scripts package is not published', async () => {
    const target = join(folder(), 'app')
    await assert.rejects(generateApp({ target, ...NAMES }, { home: folder(), published: () => false }), /not on npm/)
    assert.equal(existsSync(target), false)
  })

  it('stops before writing anything when git has no identity', async () => {
    const target = join(folder(), 'app')
    await assert.rejects(generateApp({ target, ...NAMES, scriptsPackage: 'scripts.tgz' }, { home: folder(), identity: () => false }), /--git-name and --git-email/)
    assert.equal(existsSync(target), false)
  })

  it('sets a given identity in the new repository only, before committing', async () => {
    const { calls } = await generated({ gitName: 'A Person', gitEmail: 'a@example.com' }, { identity: () => assert.fail('a given identity needs no lookup') })
    const git = calls.filter((call) => call.command === 'git').map((call) => call.args)
    assert.deepEqual(git.slice(1, 3), [['config', 'user.name', 'A Person'], ['config', 'user.email', 'a@example.com']])
    assert.ok(git.every((args) => !args.includes('--global')))
    assert.equal(git.at(-1)[0], 'commit')
  })

  it('refuses a git name without an email', async () => {
    await assert.rejects(generateApp({ target: join(folder(), 'app'), ...NAMES, gitName: 'A Person' }, { home: folder() }), /together/)
  })

  it('finds no identity when git cannot, and one when git can', () => {
    assert.equal(hasGitIdentity(() => { throw new Error('no identity') }), false)
    assert.equal(hasGitIdentity(() => 'A <a@example.com> 1 +0000'), true)
  })

  for (const [label, names, message] of [
    ['an app name with capitals', { name: 'Acme' }, /app name/],
    ['a repository without an owner', { repo: 'acme' }, /owner\/name/],
  ]) {
    it(`refuses ${label}`, async () => {
      await assert.rejects(generateApp({ target: join(folder(), 'app'), ...NAMES, ...names }, { home: folder() }), message)
    })
  }
})

describe('choosePorts', () => {
  it('skips a port the registry does not know but the machine uses', async () => {
    const ports = await choosePorts({ apps: [] }, { isFree: async (port) => port !== 5433 && port !== 5100 })
    assert.deepEqual(ports, { devDb: 5434, apiLocal: 5101 })
  })

  it('skips ports of registered apps', async () => {
    const app = { ports: { devDb: 5433, apiLocal: 5100 } }
    assert.deepEqual(await choosePorts({ apps: [app] }, { isFree: async () => true }), { devDb: 5434, apiLocal: 5101 })
  })
})

describe('appConfig', () => {
  it('keeps the template settings it does not derive', () => {
    const config = appConfig({ backup: { keep: 10 }, uat: { protectedVolumes: [] } }, { name: 'a', repo: 'o/a', ports: {} })
    assert.deepEqual(config.backup, { keep: 10 })
    assert.deepEqual(config.uat.protectedVolumes, [])
  })
})

describe('finish', () => {
  const config = { repo: 'acme/acme-shop' }

  it('creates a private repository first, then the labels, the registration and the enrolment', () => {
    const steps = finishSteps('/app', config, 'node')
    assert.deepEqual(steps[0].args.slice(0, 3), ['repo', 'create', 'acme/acme-shop'])
    assert.ok(steps[0].args.includes('--private'))
    assert.deepEqual(steps.slice(1, 3).map((step) => step.args[2]), LABELS.map((label) => label.name))
    assert.ok(steps[3].args.at(-2) === 'register')
    assert.ok(steps[4].args.at(-2) === 'enroll')
  })

  it('creates the labels the work-issue skill reads', () => {
    assert.deepEqual(LABELS.map((label) => label.name), ['epic', 'needs-design-review'])
  })

  async function appWithConfig() {
    const { target } = await generated()
    return target
  }

  it('runs nothing on a dry run', async () => {
    const appRoot = await appWithConfig()
    const ran = []
    const lines = []
    const steps = await finishApp({ appRoot, dryRun: true }, { run: async (...call) => ran.push(call), log: (line) => lines.push(line) })
    assert.deepEqual(ran, [])
    assert.equal(lines.length, steps.length)
  })

  it('runs every step in order otherwise, and stops at the first failure', async () => {
    const appRoot = await appWithConfig()
    const ran = []
    await finishApp({ appRoot }, { run: async (command) => ran.push(command), log: () => {} })
    assert.equal(ran.length, 5)
    let count = 0
    await assert.rejects(finishApp({ appRoot }, { run: async () => { count += 1; throw new Error('no') }, log: () => {} }), /no/)
    assert.equal(count, 1)
  })

  it('refuses a folder with no config', async () => {
    await assert.rejects(finishApp({ appRoot: folder(), dryRun: true }, { log: () => {} }), /is missing/)
  })
})

describe('missingServices', () => {
  it('names the services Compose did not list', () => {
    assert.deepEqual(missingServices('api\r\ndb\n', ['api', 'db', 'web']), ['web'])
  })
})
