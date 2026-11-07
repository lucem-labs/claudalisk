export const meta = {
  name: 'implement-and-review',
  description: 'Runs the unattended middle of a claudalisk issue: the implementer builds and verifies the change, the review plan is made, and the reviewer agents run in parallel.',
  whenToUse: 'From the claudalisk work-issue skill, after the main thread has planned the issue and written the brief for the implementer. Not for design questions, /code-review, opening the pull request or the uat deploy; those stay on the main thread.',
  phases: [{ title: 'Implement' }, { title: 'Plan review' }, { title: 'Review' }],
}

const input = typeof args === 'string' ? JSON.parse(args) : args ?? {}
const text = (value) => typeof value === 'string' && value.trim().length > 0
if (!Number.isInteger(input.issue)) throw new Error('issue must be an integer')
for (const key of ['worktree', 'brief', 'pluginRoot']) {
  if (!text(input[key])) throw new Error(`${key} must be a non-empty string`)
}
if (input.since !== undefined && !(typeof input.since === 'string' && /^[0-9a-f]{7,40}$/i.test(input.since))) {
  throw new Error('since must be a commit sha')
}

const implementSchema = {
  type: 'object',
  properties: {
    status: { enum: ['green', 'blocked', 'failed'] },
    devVerified: { type: 'boolean' },
    head: { type: 'string' },
    report: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'devVerified', 'head', 'report', 'questions'],
}

const planSchema = {
  type: 'object',
  properties: {
    round: { type: 'string' },
    highRisk: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
    codeReview: { type: 'object', properties: { effort: { type: 'string' } }, required: ['effort'] },
    agents: {
      type: 'array',
      items: {
        type: 'object',
        properties: { domain: { type: 'string' }, model: { type: 'string' }, brief: { type: 'string' } },
        required: ['domain', 'model', 'brief'],
      },
    },
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          files: { type: 'number' },
          adrs: { type: 'number' },
          models: { type: 'array', items: { type: 'string' } },
          quorum: { type: 'boolean' },
        },
        required: ['name', 'quorum'],
      },
    },
    unmapped: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
    out: { type: 'string' },
  },
  required: ['highRisk', 'reasons', 'codeReview', 'agents', 'domains', 'unmapped'],
}

phase('Implement')
const implement = await agent(
  [
    `Implement claudalisk issue #${input.issue}.`,
    `Work only in the worktree ${input.worktree}.`,
    `The main thread wrote the brief at ${input.brief}. Read it first and follow it.`,
    'Stop on any design question and return it in questions. Verify the change on dev as the brief says, and set devVerified to true only when you did. Return status green only when the build and every test are green on the pushed head.',
  ].join('\n'),
  { label: `Implement #${input.issue}`, phase: 'Implement', agentType: 'claudalisk:implementer', schema: implementSchema },
)
if (!implement || implement.status !== 'green' || implement.devVerified !== true) return { stage: 'implement', implement }

phase('Plan review')
const planScript = `node "${input.pluginRoot}/tools/review-plan.mjs"${input.since ? ` --since ${input.since}` : ''}`
const plan = await agent(
  [
    `In the worktree ${input.worktree}, run these two commands in order:`,
    'git fetch origin main',
    planScript,
    'Return the JSON that the second command prints, unchanged, through the schema. Run nothing else and edit nothing.',
  ].join('\n'),
  { label: 'Plan review', phase: 'Plan review', model: 'haiku', effort: 'low', schema: planSchema },
)
if (!plan) throw new Error('the review plan could not be made')

phase('Review')
const quorumDomains = new Set(plan.domains.filter((d) => d.quorum).map((d) => d.name))
const results = await parallel(
  plan.agents.map((a) => () => {
    const options = { label: `${a.domain} (${a.model})`, phase: 'Review', agentType: 'claudalisk:reviewer' }
    if (quorumDomains.has(a.domain)) {
      options.model = a.model
      options.effort = 'medium'
    }
    return agent(`Review the brief at ${a.brief}.`, options)
  }),
)
const reviews = plan.agents.map((a, i) => ({ domain: a.domain, model: a.model, report: results[i] }))

return { stage: 'reviewed', implement, plan, reviews, codeReviewEffort: plan.codeReview.effort }
