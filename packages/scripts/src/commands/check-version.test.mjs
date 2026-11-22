import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkVersion } from './check-version.mjs'
import { parseAppVersion, readAppVersion } from '../app-version.mjs'
import { fakeRunner } from '../fake-runner.mjs'
import { makeApp } from '../../test/fixture.mjs'

function appAt(version) {
  const { root } = makeApp()
  if (version !== undefined) writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, version }))
  return root
}

function git({ main = '1.4.0', onMain = false, show } = {}) {
  return fakeRunner((call) => {
    if (call.line.includes('show origin/main:package.json')) return show ?? { stdout: JSON.stringify({ private: true, version: main }) }
    if (call.line.includes('merge-base --is-ancestor HEAD origin/main')) return { code: onMain ? 0 : 1 }
    return {}
  })
}

const check = (root, runner) => checkVersion({ appRoot: root, argv: [], runner, log: () => undefined })

test('a branch whose version is higher than main passes, by patch, minor, major or a release after its prerelease', async () => {
  for (const [version, main] of [['1.4.1', '1.4.0'], ['1.5.0', '1.4.9'], ['2.0.0', '1.99.99'], ['1.5.0', '1.5.0-rc.2'], ['1.5.0-rc.10', '1.5.0-rc.9']]) {
    assert.deepEqual(await check(appAt(version), git({ main })), { version, main })
  }
})

test('a branch whose version is equal to or lower than main fails and says how to raise it', async () => {
  for (const [version, main] of [['1.4.0', '1.4.0'], ['1.3.9', '1.4.0'], ['1.5.0-rc.1', '1.5.0']]) {
    await assert.rejects(check(appAt(version), git({ main })), new RegExp(`The app is at ${version.replaceAll('.', '\\.')}, which is not higher than ${main.replaceAll('.', '\\.')} on origin/main\\. Every pull request raises the version in package\\.json \\(CLA-0099\\)`))
  }
})

test('the check fetches main before it compares, and reads nothing else', async () => {
  const runner = git()
  await check(appAt('1.4.1'), runner)
  const lines = runner.calls.map((call) => call.line.replace(/ -C \S+/, ''))
  assert.deepEqual(lines, ['git fetch --quiet origin main', 'git show origin/main:package.json', 'git merge-base --is-ancestor HEAD origin/main'])
})

test('an app with no version, or one that is not Semantic Versioning, fails before git is asked', async () => {
  const runner = git()
  await assert.rejects(check(appAt(undefined), runner), /package\.json in the app root has no "version"/)
  await assert.rejects(check(appAt('1.4'), runner), /"version" is "1\.4", which is not a Semantic Versioning 2\.0\.0 version without build metadata \(CLA-0099\)/)
  await assert.rejects(check(appAt('1.4.0+build.7'), runner), /without build metadata/)
  assert.equal(runner.calls.length, 0)
})

test('the first versioned pull request passes when main has no version yet', async () => {
  const missing = git({ show: { code: 128, stderr: "fatal: path 'package.json' does not exist in 'origin/main'" } })
  assert.deepEqual(await check(appAt('0.1.0'), missing), { version: '0.1.0', main: null })
  const unversioned = git({ show: { stdout: JSON.stringify({ private: true }) } })
  assert.deepEqual(await check(appAt('0.1.0'), unversioned), { version: '0.1.0', main: null })
})

test('a commit that is already on main passes with main\'s own version', async () => {
  assert.deepEqual(await check(appAt('1.4.0'), git({ main: '1.4.0', onMain: true })), { version: '1.4.0', main: '1.4.0' })
})

test('an unreadable main fails instead of passing', async () => {
  const broken = git({ show: { code: 128, stderr: 'fatal: invalid object name origin/main' } })
  await assert.rejects(check(appAt('1.4.1'), broken), /Reading package\.json from origin\/main failed \(fatal: invalid object name origin\/main\)/)
})

test('the app version is read past a byte order mark, and bad JSON is named', () => {
  assert.equal(parseAppVersion('﻿{"version":"1.2.3"}'), '1.2.3')
  assert.equal(parseAppVersion('{"private":true}'), null)
  assert.throws(() => parseAppVersion('{', 'package.json'), /package\.json is not valid JSON/)
  assert.equal(readAppVersion(join(appAt(undefined), 'missing')), null)
})
