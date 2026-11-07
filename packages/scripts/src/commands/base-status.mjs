import { parseOptions } from '../cli.mjs'

export const STATUS_CONTEXT = 'up to date with main'
const PAGE_SIZE = 100

function required(env, name) {
  const value = env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

export function githubClient(env, fetchImpl = fetch) {
  const base = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '')
  const token = required(env, 'GITHUB_TOKEN')
  return async function call(method, path, body) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claudalisk-base-status',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`)
    return text ? JSON.parse(text) : null
  }
}

export async function commitsBehindMain(call, repository, sha) {
  const comparison = await call('GET', `/repos/${repository}/compare/heads/main...${sha}?per_page=1`)
  if (!Number.isInteger(comparison?.behind_by)) throw new Error(`The comparison of main with ${sha} has no behind_by.`)
  return comparison.behind_by
}

export function statusFor(behindBy, targetUrl) {
  return {
    state: behindBy === 0 ? 'success' : 'failure',
    context: STATUS_CONTEXT,
    description: behindBy === 0 ? 'Up to date with main' : `${behindBy} commit${behindBy === 1 ? '' : 's'} behind main`,
    target_url: targetUrl,
  }
}

export async function setBaseStatus(call, repository, sha, behindBy, targetUrl) {
  await call('POST', `/repos/${repository}/statuses/${sha}`, statusFor(behindBy, targetUrl))
}

export async function openPullHeads(call, repository) {
  const heads = []
  for (let page = 1; ; page++) {
    const pulls = await call('GET', `/repos/${repository}/pulls?state=open&base=main&per_page=${PAGE_SIZE}&page=${page}`)
    for (const pull of pulls) heads.push({ number: pull.number, sha: pull.head.sha })
    if (pulls.length < PAGE_SIZE) return heads
  }
}

export async function baseStatus({ argv, env = process.env, fetchImpl = fetch, log = console.log }) {
  const options = parseOptions({ 'open-pulls': { type: 'boolean' } }, argv)
  const repository = required(env, 'GITHUB_REPOSITORY')
  const targetUrl = `${required(env, 'GITHUB_SERVER_URL')}/${repository}/actions/runs/${required(env, 'GITHUB_RUN_ID')}`
  const call = githubClient(env, fetchImpl)
  if (!options['open-pulls']) {
    const sha = required(env, 'GITHUB_SHA')
    const behindBy = await commitsBehindMain(call, repository, sha)
    await setBaseStatus(call, repository, sha, behindBy, targetUrl)
    log(behindBy === 0 ? `${sha} is up to date with main.` : `${sha} is ${behindBy} commit${behindBy === 1 ? '' : 's'} behind main.`)
    return behindBy === 0 ? 0 : 1
  }
  const failures = []
  const heads = await openPullHeads(call, repository)
  for (const { number, sha } of heads) {
    try {
      const behindBy = await commitsBehindMain(call, repository, sha)
      await setBaseStatus(call, repository, sha, behindBy, targetUrl)
      log(`#${number} ${sha}: ${statusFor(behindBy, targetUrl).description}.`)
    } catch (error) {
      failures.push(`#${number}: ${error.message}`)
    }
  }
  if (failures.length > 0) throw new Error(`The status of ${failures.length} of ${heads.length} open pull requests was not set:\n${failures.join('\n')}`)
  return 0
}
