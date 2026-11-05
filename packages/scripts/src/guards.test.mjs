import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeRunner } from './fake-runner.mjs'
import { assertUatDeployable, ciVerdict, deployConfirmation } from './guards.mjs'

const sha = '3e38675abcdef0123456789abcdef0123456789a'

const ownPull = { number: 7, head: sha, author: 'owner', bot: false }

function repository({ dirty = false, behind = false, pulls = [ownPull], runs = [{ status: 'completed', conclusion: 'success' }] } = {}) {
  return fakeRunner((call) => {
    if (call.line.includes('rev-parse HEAD')) return { stdout: `${sha}\n` }
    if (call.line.includes('status --porcelain')) return { stdout: dirty ? ' M file\n' : '' }
    if (call.line.includes('merge-base --is-ancestor origin/main')) return { code: behind ? 1 : 0 }
    if (call.line === 'gh api user --jq .login') return { stdout: 'owner\n' }
    if (call.line.includes(`commits/${sha}/pulls`)) return { stdout: JSON.stringify(pulls) }
    if (call.line.includes('run list')) return { stdout: JSON.stringify(runs) }
    return {}
  })
}

const deploy = (runner, options = {}) => assertUatDeployable(runner, { root: '/repo', confirm: deployConfirmation(sha), pollSeconds: 0, ...options })

test('the confirmation names the short commit', () => {
  assert.equal(deployConfirmation(sha), 'deploy uat 3e38675')
})

test('CI succeeds when any run on the commit succeeded', () => {
  assert.equal(ciVerdict([]), 'missing')
  assert.equal(ciVerdict([{ status: 'completed', conclusion: 'failure' }, { status: 'completed', conclusion: 'success' }]), 'success')
  assert.equal(ciVerdict([{ status: 'in_progress', conclusion: null }]), 'pending')
  assert.equal(ciVerdict([{ status: 'completed', conclusion: 'failure' }]), 'failed')
})

test('uat deploys only the confirmed commit', async () => {
  await assert.rejects(deploy(repository(), { confirm: 'deploy uat 0000000' }), /--confirm 'deploy uat 3e38675'/)
})

test('uat deploys only a clean tree that contains the latest main', async () => {
  await assert.rejects(deploy(repository({ dirty: true })), /uncommitted changes/)
  await assert.rejects(deploy(repository({ behind: true })), /does not contain the latest main\. Update the branch/)
})

test('uat deploys only a commit whose CI passed', async () => {
  assert.equal(await deploy(repository()), sha)
  await assert.rejects(deploy(repository({ runs: [{ status: 'completed', conclusion: 'failure' }] })), /CI failed/)
  await assert.rejects(deploy(repository({ runs: [] })), /no CI run found/)
  await assert.rejects(deploy(repository({ runs: [{ status: 'queued' }] }), { waitMinutes: 0 }), /still running/)
})

test('uat deploys only the head of an open pull request into main', async () => {
  await assert.rejects(deploy(repository({ pulls: [] })), /not the head of an open pull request into main\. .*nothing deploys main/)
  await assert.rejects(deploy(repository({ pulls: [{ ...ownPull, head: 'f'.repeat(40) }] })), /not the head of an open pull request/)
})

test('uat deploys only pull requests the signed-in account opened, never a bot', async () => {
  await assert.rejects(deploy(repository({ pulls: [{ ...ownPull, author: 'dependabot[bot]', bot: true }] })), /#7 was opened by dependabot\[bot\]; uat runs only pull requests opened by owner/)
  await assert.rejects(deploy(repository({ pulls: [{ ...ownPull, author: 'someone' }] })), /#7 was opened by someone/)
})
