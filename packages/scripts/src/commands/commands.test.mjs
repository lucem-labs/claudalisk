import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { backup } from './backup.mjs'
import { checkMigrationsAgainstMain } from './check-migrations.mjs'
import { currentVersion, deploy } from './deploy.mjs'
import { init } from './init.mjs'
import { findApiProject, migrate } from './migrate.mjs'
import { refreshDev } from './refresh-dev.mjs'
import { restore } from './restore.mjs'
import { fakeRunner } from '../fake-runner.mjs'
import { callsMatching, docker, makeApp, sha, writeBackup, writeEnvFile } from '../../test/fixture.mjs'
import { sampleConfig, twoDatabaseApp } from '../../test/sample-app.mjs'

const healthy = async () => ({ status: 'ok' })
const unhealthy = async () => null
const approvedGuard = async () => sha
const noGuard = async () => {
  throw new Error('the guard must not run')
}
const when = () => new Date('2026-10-29T10:00:00Z')

const handRun = [
  ['deploy', deploy, ['--environment', 'dev']],
  ['backup', backup, []],
  ['restore', restore, ['--environment', 'dev', '--backup', 'latest']],
  ['refresh-dev', refreshDev, []],
  ['init', init, ['--environment', 'dev']],
  ['migrate', migrate, []],
]

for (const [name, command, argv] of handRun) {
  for (const variable of ['CI', 'GITHUB_ACTIONS']) {
    test(`${name} refuses to run when ${variable} is set, before it reads or runs anything`, async () => {
      const runner = fakeRunner()
      await assert.rejects(command({ appRoot: join(makeApp().root, 'missing'), argv, env: { [variable]: 'true' }, runner }), /is run by hand only, never in CI\./)
      assert.equal(runner.calls.length, 0)
    })
  }
}

test('init creates the dev env file and volume from the config', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  await init({ appRoot: root, argv: ['--environment', 'dev'], env, runner })
  assert.ok(readFileSync(join(state, 'dev.env'), 'utf8').includes('DEV_POSTGRES_PORT=5440'))
  assert.equal(callsMatching(runner, /^docker volume create shop-dev_postgres-data$/).length, 1)
  await assert.rejects(init({ appRoot: root, argv: ['--environment', 'prod'], env, runner }), /dev or uat/)
})

test('init --adopt-volume takes the password from --password, or asks for it when it is not given', async () => {
  for (const [argv, prompted] of [[['--password', 'given-pw'], []], [[], ['Password the volume shop-dev_postgres-data was created with: ']]]) {
    const { root, state, env } = makeApp()
    const runner = docker({ state, volumes: ['shop-dev_postgres-data'] })
    const questions = []
    const prompt = async (question) => {
      questions.push(question)
      return 'given-pw'
    }
    await init({ appRoot: root, argv: ['--environment', 'dev', '--adopt-volume', ...argv], env, runner, prompt })
    assert.ok(readFileSync(join(state, 'dev.env'), 'utf8').includes('POSTGRES_PASSWORD=given-pw'))
    assert.deepEqual(questions, prompted)
    assert.equal(callsMatching(runner, /--entrypoint psql --env PGPASSWORD db --host db/).length, 1)
    assert.equal(callsMatching(runner, /volume (create|rm)/).length, 0)
  }
})

test('init refuses --password without --adopt-volume, before it runs anything', async () => {
  const { root, env } = makeApp()
  const runner = docker({ state: makeApp().state })
  await assert.rejects(init({ appRoot: root, argv: ['--environment', 'dev', '--password', 'pw'], env, runner }), /--password is only for --adopt-volume/)
  assert.equal(runner.calls.length, 0)
})

test('a dev deploy that finds a dev volume without dev.env refuses before building, unless --recreate-dev-volume is passed', async () => {
  const refused = makeApp()
  const refusedRunner = docker({ state: refused.state, volumes: ['shop-dev_postgres-data'] })
  await assert.rejects(deploy({ appRoot: refused.root, argv: ['--environment', 'dev'], env: refused.env, runner: refusedRunner, health: healthy, guard: noGuard }), /would remove the volume and its data\. Nothing was changed\..*--adopt-volume.*--recreate-dev-volume/)
  assert.equal(callsMatching(refusedRunner, /volume (create|rm)| down | build$/).length, 0)
  assert.equal(existsSync(join(refused.state, 'dev.env')), false)

  const recreated = makeApp()
  const runner = docker({ state: recreated.state, volumes: ['shop-dev_postgres-data'] })
  await deploy({ appRoot: recreated.root, argv: ['--environment', 'dev', '--recreate-dev-volume'], env: recreated.env, runner, health: healthy, guard: noGuard })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/volume rm shop-dev_postgres-data$/) < at(/volume create shop-dev_postgres-data$/))
  assert.ok(at(/volume create shop-dev_postgres-data$/) < at(/ build$/))
  assert.ok(existsSync(join(recreated.state, 'dev.env')))
})

test('a uat deploy refuses --recreate-dev-volume before it runs anything', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat', '--recreate-dev-volume'], env, runner, health: healthy, guard: approvedGuard }), /--recreate-dev-volume is only for dev/)
  assert.equal(callsMatching(runner, /^docker /).length, 0)
})

test('a dev deploy initialises, builds, migrates, starts and waits for health', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy, guard: noGuard })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(existsSync(join(state, 'dev.env')))
  assert.ok(at(/volume create/) < at(/ build$/))
  assert.ok(at(/ build$/) < at(/--profile migrate run --rm migrate$/))
  assert.ok(at(/--profile migrate run --rm migrate$/) < at(/up --detach --no-build --remove-orphans --wait$/))
  assert.equal(callsMatching(runner, /network/).length, 0)
  assert.equal(callsMatching(runner, /^docker compose .*traefik/).length, 0)
  assert.equal(callsMatching(runner, /^docker ps .*project=traefik.*status=running/).length, 1)
  const build = callsMatching(runner, / build$/)[0]
  assert.equal(build.options.env.DEPLOYED_SHA, sha)
  assert.equal(build.options.env.DEPLOYED_REF, 'feature')
  assert.ok(build.args.includes('shop-dev'))
  assert.ok(build.args.includes(join(root, 'compose.dev.yml')))
  assert.equal(callsMatching(runner, /pg_dump/).length, 0)
  assert.equal(callsMatching(runner, /^gh /).length, 0)
})

test('a dev and a uat deploy with no proxy running refuse before changing anything', async () => {
  const dev = makeApp()
  const devRunner = docker({ state: dev.state, proxyRunning: false })
  await assert.rejects(deploy({ appRoot: dev.root, argv: ['--environment', 'dev'], env: dev.env, runner: devRunner, health: healthy, guard: noGuard }), /no shared proxy is running.*Nothing was changed.*proxy up/)
  assert.equal(callsMatching(devRunner, / build$| up |pg_dump|migrate|volume create|network/).length, 0)
  assert.ok(!existsSync(join(dev.state, 'dev.env')))
  const uat = uatSetup()
  const uatRunner = docker({ state: uat.state, proxyRunning: false, volumes: ['shop-uat_postgres-data'] })
  await assert.rejects(deploy({ appRoot: uat.root, argv: ['--environment', 'uat'], env: uat.env, runner: uatRunner, health: healthy, guard: approvedGuard, now: when }), /no shared proxy is running/)
  assert.equal(callsMatching(uatRunner, / build$| up |pg_dump|migrate|volume create|network/).length, 0)
})

test('a uat deploy refuses before changing anything when the proxy is on another port or network', async () => {
  for (const [proxy, message] of [
    ['127.0.0.1:8080->80/tcp|traefik', /publishes port 8080, but this deploy expects port 80.*PROXY_PORT=8080/],
    ['127.0.0.1:80->80/tcp|bridge', /not on the 'traefik' network/],
  ]) {
    const uat = uatSetup()
    const runner = docker({ state: uat.state, proxy, volumes: ['shop-uat_postgres-data'] })
    await assert.rejects(deploy({ appRoot: uat.root, argv: ['--environment', 'uat'], env: uat.env, runner, health: healthy, guard: approvedGuard, now: when }), message)
    assert.equal(callsMatching(runner, / build$| up |pg_dump|migrate|volume create|network/).length, 0)
  }
})

test('a deploy on a matching non-default proxy port goes ahead', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state, proxy: '127.0.0.1:8080->80/tcp|traefik' })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env: { ...env, PROXY_PORT: '8080' }, runner, health: healthy, guard: noGuard })
  assert.equal(callsMatching(runner, /up --detach --no-build --remove-orphans --wait$/).length, 1)
})

test('a dev deploy of uncommitted changes marks the deployed commit dirty', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'], dirty: true })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy })
  assert.equal(callsMatching(runner, / build$/)[0].options.env.DEPLOYED_SHA, `${sha}-dirty`)
})

test('a dev deploy refuses a confirmation, and an unhealthy API fails the deploy', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'] })
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'dev', '--confirm', 'x'], env, runner, health: healthy }), /--confirm is only for uat/)
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: unhealthy }), /did not become healthy at http:\/\/shop\.dev\.localhost\/api\/health/)
})

test('a uat deploy stops at the guard before it touches Docker', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  runner.calls.length = 0
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy }), /Refusing to deploy uat: pass --confirm 'deploy uat 1234567'/)
  assert.ok(runner.calls.every((call) => call.command === 'git'))
})

const mainPath = 'backend/Shop.Persistence/Migrations/20260101000000_A.cs'

function mainHas(files) {
  return (call) => {
    if (call.command !== 'git') return undefined
    const text = call.args.join(' ')
    if (text.includes('ls-tree')) return { stdout: Object.keys(files).join('\n') }
    const shown = /show origin\/main:(.+)$/.exec(text)?.[1]
    if (shown && shown in files) return { stdout: files[shown] }
    return undefined
  }
}

function uatSetup({ hasSchema = true, applied = ['app/20260101000000_A'], failOn = [], main = { [mainPath]: 'migration' } } = {}) {
  const fixture = makeApp()
  writeEnvFile(fixture.state, 'uat', 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\n')
  mkdirSync(join(fixture.root, 'backend', 'Shop.Persistence', 'Migrations'), { recursive: true })
  writeFileSync(join(fixture.root, 'backend', 'Shop.Persistence', 'Migrations', '20260101000000_A.cs'), 'migration')
  const runner = docker({ state: fixture.state, volumes: ['shop-uat_postgres-data'], hasSchema, applied, failOn, extra: mainHas(main) })
  return { ...fixture, runner }
}

test('a uat deploy refuses when HEAD moved or the tree became dirty after the guard passed, before building', async () => {
  const moved = uatSetup()
  await assert.rejects(deploy({ appRoot: moved.root, argv: ['--environment', 'uat'], env: moved.env, runner: moved.runner, health: healthy, guard: async () => 'f'.repeat(40) }), /changed after the checks passed/)
  assert.equal(callsMatching(moved.runner, / build$/).length, 0)
  const dirty = makeApp()
  writeEnvFile(dirty.state, 'uat')
  const runner = docker({ state: dirty.state, volumes: ['shop-uat_postgres-data'], dirty: true })
  await assert.rejects(deploy({ appRoot: dirty.root, argv: ['--environment', 'uat'], env: dirty.env, runner, health: healthy, guard: approvedGuard }), /uncommitted changes/)
  assert.equal(callsMatching(runner, / build$/).length, 0)
})

test('a refused uat deploy never builds, and a uat deploy builds only after the migration checks', async () => {
  const refused = uatSetup({ applied: ['app/20260101000000_A', 'app/20260104000000_X'] })
  await assert.rejects(deploy({ appRoot: refused.root, argv: ['--environment', 'uat'], env: refused.env, runner: refused.runner, health: healthy, guard: approvedGuard, now: when }), /uat has applied app\/20260104000000_X/)
  assert.equal(callsMatching(refused.runner, / build$/).length, 0)

  const { root, env, runner } = uatSetup()
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/show origin\/main:approved-migration-edits\.txt$/) >= 0)
  assert.ok(at(/up --detach --wait db$/) < at(/show origin\/main:approved-migration-edits\.txt$/))
  assert.ok(at(/show origin\/main:approved-migration-edits\.txt$/) < at(/ build$/))
  assert.ok(at(/ build$/) < at(/pg_dump/))
  assert.ok(at(/pg_dump/) < at(/--profile migrate run --rm migrate$/))
  assert.ok(at(/--profile migrate run --rm migrate$/) < at(/up --detach --no-build --remove-orphans --wait$/))
})

test('a uat deploy reads the approved edits from origin/main through git', async () => {
  const { root, env, runner } = uatSetup()
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  assert.equal(callsMatching(runner, /show origin\/main:approved-migration-edits\.txt$/).length, 1)
})

const profilesOf = (args) => args.flatMap((arg, index) => (args[index - 1] === '--profile' ? [arg] : []))
const composeVerbOf = (args) => args.find((arg, index) => ['build', 'run', 'up'].includes(arg) && args[index - 1] !== '--profile')

for (const environment of ['dev', 'uat']) {
  test(`a ${environment} deploy builds every Compose profile it later runs, so the migrate image is never stale`, async () => {
    const setup = environment === 'uat' ? uatSetup() : makeApp()
    const runner = setup.runner ?? docker({ state: setup.state })
    await deploy({ appRoot: setup.root, argv: ['--environment', environment], env: setup.env, runner, health: healthy, guard: approvedGuard, now: when })
    const composeCalls = runner.calls.filter((call) => call.command === 'docker' && call.args[0] === 'compose')
    const builds = composeCalls.filter((call) => composeVerbOf(call.args) === 'build')
    assert.equal(builds.length, 1)
    const built = new Set(profilesOf(builds[0].args))
    const buildIndex = runner.calls.indexOf(builds[0])
    const started = composeCalls.filter((call) => runner.calls.indexOf(call) > buildIndex && ['run', 'up'].includes(composeVerbOf(call.args)))
    assert.ok(started.some((call) => call.args.includes('migrate')))
    for (const call of started) {
      for (const profile of profilesOf(call.args)) assert.ok(built.has(profile), `${call.line} runs profile '${profile}', which the build skipped`)
    }
  })
}

const uatDeploy = (setup, argv = []) => deploy({ appRoot: setup.root, argv: ['--environment', 'uat', ...argv], env: setup.env, runner: setup.runner, health: healthy, guard: approvedGuard, now: when })

test('a uat deploy refuses an applied migration that is neither recorded nor on origin/main, and --adopt-unrecorded-migrations records it', async () => {
  const refused = uatSetup({ main: {} })
  await assert.rejects(uatDeploy(refused), /20260101000000_A.*--adopt-unrecorded-migrations/)
  assert.equal(callsMatching(refused.runner, / build$/).length, 0)
  assert.ok(!existsSync(join(refused.state, 'uat-migrations.json')))

  const adopted = uatSetup({ main: {} })
  await uatDeploy(adopted, ['--adopt-unrecorded-migrations'])
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(adopted.state, 'uat-migrations.json'), 'utf8'))), ['20260101000000_A'])
})

test('a uat deploy takes main as the baseline for an unrecorded migration, and refuses a commit that differs from it', async () => {
  const same = uatSetup()
  await uatDeploy(same)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(same.state, 'uat-migrations.json'), 'utf8'))), ['20260101000000_A'])

  const differs = uatSetup({ main: { [mainPath]: 'migration as merged' } })
  await assert.rejects(uatDeploy(differs), /20260101000000_A changed after uat applied it/)
  assert.equal(callsMatching(differs.runner, / build$/).length, 0)
})

test('--adopt-unrecorded-migrations is only for uat', async () => {
  const { root, state, env } = makeApp()
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'dev', '--adopt-unrecorded-migrations'], env, runner: docker({ state }), health: healthy }), /only for uat/)
})

test('a uat deploy passes the app repository to the guard', async () => {
  const { root, env, runner } = uatSetup()
  let seen
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: async (_runner, options) => { seen = options; return sha }, now: when })
  assert.equal(seen.repo, 'acme/shop')
})

test('the deployed ref is the current branch, read without asking git to resolve a name', async () => {
  const named = docker({ state: makeApp().state })
  assert.equal((await currentVersion(named, '/repo')).ref, 'feature')
  assert.ok(callsMatching(named, /branch --show-current$/).length === 1)
  assert.equal(callsMatching(named, /abbrev-ref/).length, 0)
  const detached = docker({ state: makeApp().state, branch: '', extra: (call) => (call.line.includes('branch --remotes') ? { stdout: '  origin/feature\n  origin/HEAD -> origin/main\n' } : undefined) })
  assert.equal((await currentVersion(detached, '/repo')).ref, 'origin/feature')
  const alone = docker({ state: makeApp().state, branch: '' })
  assert.equal((await currentVersion(alone, '/repo')).ref, 'detached')
})

test('a uat deploy of an existing database backs up first, with the deploy as the reason', async () => {
  const { root, state, env, runner } = uatSetup()
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/up --detach --wait db$/) < at(/pg_dump/))
  assert.ok(at(/pg_dump/) < at(/--profile migrate run --rm migrate$/))
  const [folder] = readdirSync(join(state, 'backups'))
  assert.equal(folder, `20261029T100000Z-${sha.slice(0, 7)}`)
  const manifest = JSON.parse(readFileSync(join(state, 'backups', folder, 'manifest.json'), 'utf8'))
  assert.equal(manifest.reason, 'deploy')
  assert.deepEqual(manifest.migrations, ['app/20260101000000_A'])
  assert.ok(callsMatching(runner, /^gh api --method POST repos\/acme\/shop\/deployments --input -$/).length === 1)
  assert.ok(callsMatching(runner, /repos\/acme\/shop\/deployments\/7\/statuses/).length === 1)
  assert.ok(existsSync(join(state, 'uat-migrations.json')))
})

test('a first uat deploy has nothing to back up', async () => {
  const { root, state, env, runner } = uatSetup({ hasSchema: false, applied: [] })
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard })
  assert.equal(callsMatching(runner, /pg_dump/).length, 0)
  assert.deepEqual(readdirSync(join(state, 'backups')), [])
})

test('a uat deploy of an empty database next to a complete backup refuses before it builds', async () => {
  const { root, state, env, runner } = uatSetup({ hasSchema: false, applied: [] })
  writeBackup(state, '20261028T100000Z-aaaaaaa', { createdAt: '2026-10-28T10:00:00Z', migrations: ['app/20260101000000_A'] })
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when }), /no uat database has a schema, but .*newest 20261028T100000Z-aaaaaaa.*Nothing was changed\.$/s)
  assert.equal(callsMatching(runner, / build$|pg_dump|run --rm migrate|image tag|\/deployments/).length, 0)
  assert.deepEqual(readdirSync(join(state, 'backups')), ['20261028T100000Z-aaaaaaa'])
})

test('a failed migration is reported with the pre-deploy backup and nothing is started', async () => {
  const { root, env, runner } = uatSetup({ failOn: ['run --rm migrate'] })
  const errors = []
  const original = console.error
  console.error = (message) => errors.push(message)
  try {
    await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when }), /Applying migrations to uat failed/)
  } finally {
    console.error = original
  }
  assert.ok(errors.some((message) => message.includes('Pre-deploy backup:')))
  assert.equal(callsMatching(runner, /--remove-orphans/).length, 0)
})

test('a uat deploy deletes every backup but the current and the previous one', async () => {
  const { root, state, env, runner } = uatSetup()
  for (const day of ['01', '02', '03']) {
    writeBackup(state, `202610${day}T000000Z-aaaaaaa`, { createdAt: `2026-10-${day}T00:00:00Z`, migrations: ['app/20260101000000_A'] })
  }
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  assert.deepEqual(readdirSync(join(state, 'backups')).sort(), ['20261003T000000Z-aaaaaaa', `20261029T100000Z-${sha.slice(0, 7)}`])
})

function images({ before = 'sha256:old', after = 'sha256:new', listed } = {}) {
  const rows = listed ?? [['shop-dev-api', 'latest', after], ['shop-dev-migrate', 'latest', 'sha256:migrate']]
  return (call) => {
    const { args } = call
    if (args[0] === 'image' && args[1] === 'ls') return { stdout: rows.map((row) => row.join('\t')).join('\n') }
    if (args[0] === 'compose' && args.includes('ps') && !args.includes('api') && !args.includes('db')) return { stdout: 'api1\ndb1\n' }
    if (args[0] === 'inspect' && args[2].includes('com.docker.compose.service')) return { stdout: `api\t${before}\ndb\tsha256:postgres\n` }
    if (args[0] === 'image' && args[1] === 'inspect') {
      if (args.includes('shop-dev-db')) return { code: 1, stderr: 'No such image' }
      return { stdout: args.at(-1) === 'shop-dev-api:replaced' ? `${after}\n${before}\n` : `${before}\n` }
    }
    if (args[0] === 'image' && args[1] === 'rm') return {}
    if (args[0] === 'image' && args[1] === 'prune') return { stdout: 'Deleted Images:\nsha256:older\n\nTotal reclaimed space: 386MB\n' }
    return undefined
  }
}

function devDeploy(extra, health = healthy, version) {
  const { root, state, env } = makeApp()
  if (version) writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, version }))
  writeEnvFile(state, 'dev')
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'], extra })
  return { runner, done: deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health }) }
}

const imageChanges = (runner) => callsMatching(runner, /^docker (tag|image rm|image prune|rmi|volume rm|volume prune|system prune) /).map((call) => call.line)

test('a deploy holds the running image before it builds, keeps it as previous, then removes the older images of its project only', async () => {
  const { runner, done } = devDeploy(images())
  await done
  assert.deepEqual(imageChanges(runner), [
    'docker tag sha256:old shop-dev-api:replaced',
    'docker tag shop-dev-api:replaced shop-dev-api:previous',
    'docker image rm shop-dev-api:replaced',
    'docker image prune --force --filter label=com.docker.compose.project=shop-dev',
  ])
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/^docker tag sha256:old /) < at(/ build$/))
  assert.ok(at(/up --detach --no-build --remove-orphans --wait$/) < at(/^docker tag shop-dev-api:replaced /))
})

test('a deploy that rebuilt the same image leaves the previous tag where it is', async () => {
  const { runner, done } = devDeploy(images({ before: 'sha256:same', after: 'sha256:same' }))
  await done
  assert.deepEqual(imageChanges(runner), [
    'docker tag sha256:same shop-dev-api:replaced',
    'docker image rm shop-dev-api:replaced',
    'docker image prune --force --filter label=com.docker.compose.project=shop-dev',
  ])
})

test('a deploy that does not become healthy only holds the running image and removes nothing', async () => {
  const { runner, done } = devDeploy(images(), unhealthy)
  await assert.rejects(done, /did not become healthy/)
  assert.deepEqual(imageChanges(runner), ['docker tag sha256:old shop-dev-api:replaced'])
})

test('a deploy of a versioned app passes the version on, tags what it built with it and drops the version tags of older images', async () => {
  const listed = [
    ['shop-dev-api', 'latest', 'sha256:new'],
    ['shop-dev-api', 'previous', 'sha256:old'],
    ['shop-dev-api', '1.3.2', 'sha256:old'],
    ['shop-dev-api', '1.2.0', 'sha256:older'],
    ['<none>', '<none>', 'sha256:dangling'],
    ['shop-dev-migrate', 'latest', 'sha256:migrate'],
    ['shop-dev-migrate', '1.3.2', 'sha256:migrate-old'],
  ]
  const { runner, done } = devDeploy(images({ listed }), healthy, '1.4.0')
  await done
  assert.deepEqual(imageChanges(runner), [
    'docker tag sha256:old shop-dev-api:replaced',
    'docker tag shop-dev-api:replaced shop-dev-api:previous',
    'docker image rm shop-dev-api:replaced',
    'docker tag shop-dev-api:latest shop-dev-api:1.4.0',
    'docker image rm shop-dev-api:1.2.0',
    'docker tag shop-dev-migrate:latest shop-dev-migrate:1.4.0',
    'docker image rm shop-dev-migrate:1.3.2',
    'docker image prune --force --filter label=com.docker.compose.project=shop-dev',
  ])
  for (const pattern of [/ build$/, /--profile migrate run --rm migrate$/, /up --detach --no-build --remove-orphans --wait$/]) {
    assert.equal(callsMatching(runner, pattern)[0].options.env.DEPLOYED_VERSION, '1.4.0', String(pattern))
  }
})

test('a deploy of an app without a version passes unknown and adds no version tag', async () => {
  const { runner, done } = devDeploy(images())
  await done
  assert.equal(callsMatching(runner, / build$/)[0].options.env.DEPLOYED_VERSION, 'unknown')
  assert.equal(callsMatching(runner, /^docker tag shop-dev-\w+:latest /).length, 0)
})

test('a deploy refuses a version that is not Semantic Versioning before it builds', async () => {
  const { runner, done } = devDeploy(images(), healthy, '1.4')
  await assert.rejects(done, /"version" is "1\.4", which is not a Semantic Versioning 2\.0\.0 version/)
  assert.equal(callsMatching(runner, / build$| up |^docker tag /).length, 0)
})

test('a uat deploy names the version in the GitHub deployment', async () => {
  const { root, env, runner } = uatSetup()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, version: '1.4.0' }))
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  const [created] = callsMatching(runner, /^gh api --method POST repos\/acme\/shop\/deployments --input -$/)
  assert.equal(JSON.parse(created.options.input).description, 'Local deploy of 1.4.0 from feature')
})

test('a deploy refuses, before it holds or builds anything, when a built service names its own image', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const services = { api: { build: { context: '.' }, image: 'shop:1234567' }, web: { build: { context: '.' }, image: 'shop-web:1234567' }, db: { image: 'postgres:18' } }
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'], services, extra: images() })
  await assert.rejects(
    deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy }),
    /Refusing to deploy dev: the Compose files name the image of a service they build: api \(image: shop:1234567\), web \(image: shop-web:1234567\)\. .*default name, shop-dev-<service>.*Remove the image key.*Nothing was changed\.$/,
  )
  assert.equal(callsMatching(runner, / build$| up |^docker (tag|image) /).length, 0)
  const [read] = callsMatching(runner, / config /)
  assert.match(read.line, / --profile migrate config --format json$/)
  assert.equal(read.options.env.DEPLOYED_SHA, sha)
})

test('a built service may spell out the default image name, and a pulled image may have any name', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const services = { api: { build: { context: '.' }, image: 'shop-dev-api' }, migrate: { build: { context: '.' }, image: 'shop-dev-migrate:latest' }, db: { image: 'postgres:18' } }
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'], services })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy })
  assert.equal(callsMatching(runner, / build$/).length, 1)
})

test('a uat deploy with a named built image refuses before the database starts', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  const runner = docker({ state, volumes: ['shop-uat_postgres-data'], services: { api: { build: {}, image: 'shop:abc' } } })
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when }), /Refusing to deploy uat: .*shop-uat-<service>.*Nothing was changed\.$/)
  assert.equal(callsMatching(runner, / up | build$|pg_dump/).length, 0)
})

test('a Compose config that cannot be read stops the deploy before it changes anything', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state, volumes: ['shop-dev_postgres-data'], failOn: [' config '] })
  await assert.rejects(deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy }), /Reading the Compose config/)
  assert.equal(callsMatching(runner, / build$| up /).length, 0)
})

test('a first deploy has no image to hold', async () => {
  const { root, state, env } = makeApp()
  const runner = docker({ state })
  await deploy({ appRoot: root, argv: ['--environment', 'dev'], env, runner, health: healthy })
  assert.equal(callsMatching(runner, /^docker (tag|image rm) /).length, 0)
})

test('a deploy succeeds when the older images cannot be removed', async () => {
  const { runner, done } = devDeploy((call) => (call.line.startsWith('docker image prune') ? { code: 1, stderr: 'daemon busy' } : images()(call)))
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    await done
  } finally {
    console.warn = original
  }
  assert.ok(warnings.some((message) => /older shop-dev images were not removed.*daemon busy/.test(message)), warnings.join('\n'))
  assert.equal(callsMatching(runner, /up --detach --no-build --remove-orphans --wait$/).length, 1)
})

test('a backup command names the reason in the manifest', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  const runner = docker({ state })
  await backup({ appRoot: root, argv: ['--reason', 'before the holiday'], env, runner, now: when })
  const [folder] = readdirSync(join(state, 'backups'))
  assert.equal(JSON.parse(readFileSync(join(state, 'backups', folder, 'manifest.json'), 'utf8')).reason, 'before the holiday')
  await backup({ appRoot: root, argv: [], env, runner, now: () => new Date('2026-10-29T10:00:05Z') })
  assert.equal(readdirSync(join(state, 'backups')).length, 2)
})

test('a backup command works while the API is down', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  const runner = docker({ state })
  await backup({ appRoot: root, argv: [], env, runner, now: when })
  assert.equal(readdirSync(join(state, 'backups'))[0], `20261029T100000Z-${sha.slice(0, 7)}`)
})

test('restore refuses uat without the owner and restores dev from the latest backup', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'uat')
  writeEnvFile(state, 'dev')
  writeBackup(state, '20261001T000000Z-aaaaaaa', { createdAt: '2026-10-01T00:00:00Z' })
  const runner = docker({ state })
  await assert.rejects(restore({ appRoot: root, argv: ['--environment', 'uat', '--backup', '20261001T000000Z-aaaaaaa'], env, runner }), /only the owner restores uat/)
  assert.equal(runner.calls.length, 0)
  await restore({ appRoot: root, argv: ['--environment', 'dev', '--backup', 'latest', '--no-start'], env, runner, now: when })
  assert.ok(callsMatching(runner, /pg_restore/).length > 0)
  assert.ok(runner.calls.some((call) => (call.options.input ?? '').includes('RENAME TO "shop"')))
  assert.equal(callsMatching(runner, /start api$/).length, 0)
})

test('refresh-dev needs a deployed dev, restores the backup, migrates and starts the API', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  writeBackup(state, '20261001T000000Z-aaaaaaa', { createdAt: '2026-10-01T00:00:00Z' })
  const none = docker({ state, apiEnv: '' })
  await assert.rejects(refreshDev({ appRoot: root, argv: [], env, runner: none, health: healthy }), /Deploy dev first/)
  const runner = docker({ state })
  await refreshDev({ appRoot: root, argv: [], env, runner, health: healthy, now: when })
  const lines = runner.calls.map((call) => call.line)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/stop api$/) < at(/--profile migrate run --rm migrate$/))
  assert.ok(at(/--profile migrate run --rm migrate$/) < at(/start api$/))
  await assert.rejects(refreshDev({ appRoot: root, argv: [], env, runner, health: unhealthy }), /did not become healthy after the refresh/)
})

test('refresh-dev --fresh takes a uat backup first, and refuses to be combined with --backup', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  writeEnvFile(state, 'uat')
  const runner = docker({ state })
  await assert.rejects(refreshDev({ appRoot: root, argv: ['--fresh', '--backup', 'x'], env, runner, health: healthy }), /do not combine/)
  await refreshDev({ appRoot: root, argv: ['--fresh'], env, runner, health: healthy, now: when })
  const [folder] = readdirSync(join(state, 'backups'))
  assert.equal(JSON.parse(readFileSync(join(state, 'backups', folder, 'manifest.json'), 'utf8')).reason, 'refresh-dev')
  assert.ok(callsMatching(runner, /pg_restore -U/).length > 0)
})

function backupsOf(state) {
  return readdirSync(join(state, 'backups')).sort()
}

const newest = `20261029T100000Z-${sha.slice(0, 7)}`

function threeBackups(migrationsOf = () => ['app/20260101000000_A']) {
  const fixture = makeApp()
  writeEnvFile(fixture.state, 'uat')
  for (const day of ['01', '02', '03']) {
    writeBackup(fixture.state, `202610${day}T000000Z-aaaaaaa`, { createdAt: `2026-10-${day}T00:00:00Z`, migrations: migrationsOf(day) })
  }
  return fixture
}

const mainHasOnlyA = (call) => {
  if (call.line.includes('ls-tree')) return { stdout: 'backend/Shop.Api/Migrations/20261001000000_A.cs\n' }
  if (call.line.includes('git -C') && call.line.includes(' show ')) return { stdout: '[Migration("20261001000000_A")]' }
  return undefined
}

test('a backup deletes every backup but itself and the one before it', async () => {
  const { root, state, env } = threeBackups()
  await backup({ appRoot: root, argv: [], env, runner: docker({ state, applied: ['app/20260101000000_A'], extra: mainHas({ [mainPath]: 'migration' }) }), now: when })
  assert.deepEqual(backupsOf(state), ['20261003T000000Z-aaaaaaa', newest])
})

test('a backup keeps the restore point from before a migration uat has and main lacks', async () => {
  const { root, state, env } = threeBackups((day) => (day === '01' ? ['app/20261001000000_A'] : ['app/20261001000000_A', 'app/20261002000000_B']))
  await backup({ appRoot: root, argv: [], env, runner: docker({ state, applied: ['app/20261001000000_A', 'app/20261002000000_B'], extra: mainHasOnlyA }), now: when })
  assert.deepEqual(backupsOf(state), ['20261001T000000Z-aaaaaaa', '20261003T000000Z-aaaaaaa', newest])
})

test('a backup keeps the restore point before a migration in a schema main does not migrate at all', async () => {
  const { root, state, env } = threeBackups((day) => (day === '01' ? ['app/20261001000000_A'] : ['app/20261001000000_A', 'billing/20261005000000_N']))
  await backup({ appRoot: root, argv: [], env, runner: docker({ state, applied: ['app/20261001000000_A', 'billing/20261005000000_N'], extra: mainHasOnlyA }), now: when })
  assert.deepEqual(backupsOf(state), ['20261001T000000Z-aaaaaaa', '20261003T000000Z-aaaaaaa', newest])
})

test('a backup leaves an incomplete folder alone', async () => {
  const { root, state, env } = threeBackups()
  mkdirSync(join(state, 'backups', '20260901T000000Z-aaaaaaa'))
  await backup({ appRoot: root, argv: [], env, runner: docker({ state, applied: ['app/20260101000000_A'], extra: mainHas({ [mainPath]: 'migration' }) }), now: when })
  assert.deepEqual(backupsOf(state), ['20260901T000000Z-aaaaaaa', '20261003T000000Z-aaaaaaa', newest])
})

test('a backup that cannot read origin/main deletes nothing and still succeeds', async () => {
  const { root, state, env } = threeBackups()
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    await backup({ appRoot: root, argv: [], env, runner: docker({ state, failOn: ['ls-tree'] }), now: when })
  } finally {
    console.warn = original
  }
  assert.equal(backupsOf(state).length, 4)
  assert.ok(warnings.some((message) => /older backups were not pruned, so all of them are kept/.test(message)), warnings.join('\n'))
})

test('a uat restore keeps the backup it restores, however old, while its own backup prunes the rest', async () => {
  const { root, state, env } = threeBackups()
  const runner = docker({ state, applied: ['app/20260101000000_A'], extra: mainHas({ [mainPath]: 'migration' }) })
  const oldest = '20261001T000000Z-aaaaaaa'
  await restore({ appRoot: root, argv: ['--environment', 'uat', '--backup', oldest, '--owner-approved', '--confirm', `restore uat ${oldest}`, '--no-start'], env, runner, now: when })
  assert.deepEqual(backupsOf(state), [oldest, '20261003T000000Z-aaaaaaa', newest])
  assert.ok(runner.calls.some((call) => (call.options.input ?? '').includes('RENAME TO "shop"')))
})

test('migrate finds the one API project and points each database variable at dev', async () => {
  const { root, state, env } = makeApp({ config: { ...sampleConfig, databases: twoDatabaseApp.databases } })
  writeEnvFile(state, 'dev', 'POSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\nConnectionStrings__Shop=Database=a\nConnectionStrings__Identity=Database=b\n')
  mkdirSync(join(root, 'backend', 'Shop.Api'), { recursive: true })
  writeFileSync(join(root, 'backend', 'Shop.Api', 'Shop.Api.csproj'), '')
  const runner = docker({ state })
  await migrate({ appRoot: root, argv: [], env, runner })
  const [call] = callsMatching(runner, /^dotnet run/)
  assert.deepEqual(call.args, ['run', '--project', join('backend', 'Shop.Api', 'Shop.Api.csproj'), '--', '--initialize-databases'])
  assert.equal(call.options.cwd, root)
  assert.equal(call.options.env.ConnectionStrings__Shop, 'Host=localhost;Port=5440;Database=a;Username=app;Password=pw')
  assert.equal(call.options.env.ConnectionStrings__Identity, 'Host=localhost;Port=5440;Database=b;Username=app;Password=pw')
})

test('migrate ignores a connection string in the shell and takes a --project override', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  const runner = docker({ state })
  await migrate({ appRoot: root, argv: ['--project', 'x/y.csproj'], env: { ...env, ConnectionStrings__Shop: 'Host=elsewhere' }, runner })
  const [call] = callsMatching(runner, /^dotnet run/)
  assert.equal(call.args[2], 'x/y.csproj')
  assert.equal(call.options.env.ConnectionStrings__Shop, 'Host=localhost;Port=5440;Database=shop;Username=app;Password=pw')
})

test('migrate fails when the dotnet run fails', async () => {
  const { root, state, env } = makeApp()
  writeEnvFile(state, 'dev')
  mkdirSync(join(root, 'backend', 'Shop.Api'), { recursive: true })
  writeFileSync(join(root, 'backend', 'Shop.Api', 'Shop.Api.csproj'), '')
  await assert.rejects(migrate({ appRoot: root, argv: [], env, runner: docker({ state, failOn: ['dotnet run'] }) }), /Database migration failed/)
})

test('the API project is the one backend folder ending in .Api with its csproj', () => {
  const { root } = makeApp()
  assert.throws(() => findApiProject(root), /Found 0 API projects.*--project/)
  for (const name of ['Shop.Api', 'Other.Api', 'Shop.Domain']) {
    mkdirSync(join(root, 'backend', name), { recursive: true })
    writeFileSync(join(root, 'backend', name, `${name}.csproj`), '')
  }
  assert.throws(() => findApiProject(root), /Found 2 API projects/)
  rmSync(join(root, 'backend', 'Other.Api', 'Other.Api.csproj'))
  mkdirSync(join(root, 'backend', 'Empty.Api'))
  assert.equal(findApiProject(root), join('backend', 'Shop.Api', 'Shop.Api.csproj'))
})

function checkSetup({ branch, main, approvals }) {
  const { root } = makeApp()
  const folder = join(root, 'backend', 'Shop.Persistence', 'Migrations')
  mkdirSync(folder, { recursive: true })
  for (const [name, text] of Object.entries(branch)) writeFileSync(join(folder, name), text)
  const files = Object.fromEntries(Object.entries(main).map(([name, text]) => [`backend/Shop.Persistence/Migrations/${name}`, text]))
  const runner = fakeRunner((call) => {
    if (call.args.join(' ').includes('approved-migration-edits.txt')) {
      return approvals === undefined ? { code: 128, stderr: "fatal: path 'approved-migration-edits.txt' does not exist in 'origin/main'" } : { stdout: approvals }
    }
    return mainHas(files)(call)
  })
  return { root, runner }
}

const checkRun = ({ root, runner }) => checkMigrationsAgainstMain({ appRoot: root, argv: [], env: {}, runner })

test('check-migrations passes when every migration on main is unchanged, new ones are allowed, and it runs in CI', async () => {
  const setup = checkSetup({
    branch: { '20260101000000_A.cs': 'a\r\n', '20260102000000_New.cs': 'new' },
    main: { '20260101000000_A.cs': 'a\n' },
  })
  const result = await checkMigrationsAgainstMain({ appRoot: setup.root, argv: [], env: { CI: 'true' }, runner: setup.runner })
  assert.deepEqual(result, { changed: [], missing: [] })
})

test('check-migrations names a changed and a missing migration with the fix-forward and approval path', async () => {
  const setup = checkSetup({
    branch: { '20260101000000_A.cs': 'edited' },
    main: { '20260101000000_A.cs': 'a', '20260102000000_B.cs': 'b' },
  })
  await assert.rejects(checkRun(setup), (error) => {
    assert.match(error.message, /Changed after reaching origin\/main: 20260101000000_A\./)
    assert.match(error.message, /missing here: 20260102000000_B\./)
    assert.match(error.message, /CLA-0010.*fix forward.*approved-migration-edits\.txt/s)
    return true
  })
})

test('check-migrations accepts a changed migration only when main approves exactly its new content', async () => {
  const hash = (text) => createHash('sha256').update(text).digest('hex')
  const branch = { '20260101000000_A.cs': 'edited' }
  const main = { '20260101000000_A.cs': 'a' }
  const entry = (text) => `shop/20260101000000_A ${hash(text)} Kept the old index name. #42\n`
  await checkRun(checkSetup({ branch, main, approvals: entry('edited') }))
  await assert.rejects(checkRun(checkSetup({ branch, main, approvals: entry('edited again') })), /Changed after reaching/)
  await assert.rejects(checkRun(checkSetup({ branch, main, approvals: 'shop/20260101000000_A not-a-hash Kept the old index name. #42\n' })), /Changed after reaching/)
})

test('a uat deploy fetches origin/main once, before it reads the approvals and the main migrations', async () => {
  const { root, env, runner } = uatSetup()
  await deploy({ appRoot: root, argv: ['--environment', 'uat'], env, runner, health: healthy, guard: approvedGuard, now: when })
  const lines = runner.calls.map((call) => call.line)
  assert.equal(lines.filter((line) => /fetch --quiet origin main$/.test(line)).length, 1)
  const at = (pattern) => lines.findIndex((line) => pattern.test(line))
  assert.ok(at(/fetch --quiet origin main$/) < at(/show origin\/main:approved-migration-edits\.txt$/))
  assert.ok(at(/fetch --quiet origin main$/) < at(/ls-tree -r --name-only origin\/main/))
})

test('a uat refusal for a changed migration gives the entry to paste and says to rebase when main was the baseline', async () => {
  const differs = uatSetup({ main: { [mainPath]: 'migration as merged' } })
  const expected = createHash('sha256').update('migration').digest('hex')
  await assert.rejects(uatDeploy(differs), (error) => {
    assert.ok(error.message.includes(`app/20260101000000_A ${expected}`), error.message)
    assert.match(error.message, /LF line endings/)
    assert.match(error.message, /rebase it onto main/)
    return true
  })
})

test('a check-migrations refusal gives the entry to paste for each changed migration', async () => {
  const setup = checkSetup({ branch: { '20260101000000_A.cs': 'edited' }, main: { '20260101000000_A.cs': 'a' } })
  const expected = createHash('sha256').update('edited').digest('hex')
  await assert.rejects(checkRun(setup), (error) => {
    assert.ok(error.message.includes(`<schema>/20260101000000_A ${expected}`), error.message)
    assert.match(error.message, /LF line endings/)
    return true
  })
})

test('a uat deploy refuses when the fetch of origin/main fails, before it starts the database', async () => {
  const fixture = makeApp()
  writeEnvFile(fixture.state, 'uat', 'POSTGRES_DB=shop\nPOSTGRES_USER=app\nPOSTGRES_PASSWORD=pw\n')
  mkdirSync(join(fixture.root, 'backend', 'Shop.Persistence', 'Migrations'), { recursive: true })
  writeFileSync(join(fixture.root, 'backend', 'Shop.Persistence', 'Migrations', '20260101000000_A.cs'), 'migration')
  const runner = docker({ state: fixture.state, volumes: ['shop-uat_postgres-data'], applied: ['app/20260101000000_A'], extra: (call) => (call.line.includes('fetch --quiet origin main') ? { code: 1, stderr: 'no network' } : undefined) })
  await assert.rejects(uatDeploy({ ...fixture, runner }), /git fetch origin main failed \(no network\).*stale.*Nothing was changed\./s)
  assert.equal(callsMatching(runner, / build$/).length, 0)
  assert.equal(callsMatching(runner, / up /).length, 0)
})
