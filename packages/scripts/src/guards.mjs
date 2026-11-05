import { runChecked, sleep } from './process.mjs'

export function deployConfirmation(sha) {
  return `deploy uat ${sha.slice(0, 7)}`
}

export function ciVerdict(runs) {
  const present = (runs ?? []).filter(Boolean)
  if (present.length === 0) return 'missing'
  if (present.some((run) => run.conclusion === 'success')) return 'success'
  if (present.some((run) => run.status !== 'completed')) return 'pending'
  return 'failed'
}

export async function assertUatDeployable(runner, { root, confirm, waitMinutes = 30, pollSeconds = 30, now = () => Date.now() }) {
  const git = (args, what) => runChecked(runner, 'git', ['-C', root, ...args], { what })
  const sha = (await git(['rev-parse', 'HEAD'])).stdout.trim()
  const short = sha.slice(0, 7)
  if (confirm !== deployConfirmation(sha)) {
    throw new Error(`Refusing to deploy uat: pass --confirm '${deployConfirmation(sha)}' to deploy commit ${sha}.`)
  }
  if ((await git(['status', '--porcelain'])).stdout.trim()) {
    throw new Error('Refusing to deploy uat: the working tree has uncommitted changes. uat only runs committed, pushed, tested code.')
  }
  await git(['fetch', '--quiet', 'origin', 'main'], 'Refusing to deploy uat: git fetch')
  const containsMain = await runner('git', ['-C', root, 'merge-base', '--is-ancestor', 'origin/main', sha])
  if (containsMain.code === 1) {
    throw new Error(`Refusing to deploy uat: ${short} does not contain the latest main. Update the branch (merge main into it), push, and deploy again once CI passes.`)
  }
  if (containsMain.code !== 0) throw new Error(`Refusing to deploy uat: git merge-base failed (${containsMain.stderr.trim()}).`)
  const gh = (args, what) => runChecked(runner, 'gh', args, { cwd: root, what: `Refusing to deploy uat: ${what} (is gh logged in?)` })
  const account = (await gh(['api', 'user', '--jq', '.login'], 'reading the signed-in GitHub account')).stdout.trim()
  const pulls = JSON.parse((await gh(
    ['api', `repos/{owner}/{repo}/commits/${sha}/pulls`, '--jq', '[.[] | select(.state == "open" and .base.ref == "main") | {number, head: .head.sha, author: .user.login, bot: (.user.type == "Bot")}]'],
    'reading the pull requests of the commit',
  )).stdout || '[]').filter((pull) => pull.head === sha)
  if (pulls.length === 0) {
    throw new Error(`Refusing to deploy uat: ${short} is not the head of an open pull request into main. uat runs only pull requests under review; nothing deploys main.`)
  }
  const pull = pulls.find((candidate) => !candidate.bot && candidate.author === account)
  if (!pull) {
    throw new Error(`Refusing to deploy uat: ${pulls.map((candidate) => `#${candidate.number} was opened by ${candidate.author}`).join(', ')}; uat runs only pull requests opened by ${account}.`)
  }
  console.log(`${short} is the head of #${pull.number}.`)
  const deadline = now() + waitMinutes * 60_000
  for (;;) {
    const listed = await gh(['run', 'list', '--commit', sha, '--workflow', 'ci.yml', '--limit', '20', '--json', 'status,conclusion'], 'reading CI runs')
    const verdict = ciVerdict(JSON.parse(listed.stdout || '[]'))
    if (verdict === 'success') {
      console.log(`CI passed on ${short}.`)
      return sha
    }
    if (verdict === 'failed') throw new Error(`Refusing to deploy uat: CI failed on ${short}.`)
    if (verdict === 'missing') throw new Error(`Refusing to deploy uat: no CI run found for ${short}; push the branch and let CI pass first.`)
    if (now() >= deadline) throw new Error(`Refusing to deploy uat: CI on ${short} is still running after ${waitMinutes} minutes.`)
    console.log(`CI on ${short} is still running; waiting...`)
    await sleep(pollSeconds * 1000)
  }
}
