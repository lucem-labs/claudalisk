import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from './render-results.mjs'
import { errorsIn, mergeParts } from './lib/merge.mjs'
import { roslynAttempts } from './lib/launch.mjs'
import { summarizeValues } from './lib/common.mjs'

const stats = { runs: 5, medianMs: 120, p95Ms: 300, minMs: 90, maxMs: 310 }

const sample = {
  os: 'linux',
  versions: { claudeCodeClient: '2.1.316', node: 'v24', dotnet: '10', pinned: { roslyn: '5' }, global: {} },
  hookDefaultDeadlineMs: 3000,
  setups: { plugins: { manualSteps: ['npm install -g typescript@7'], installSteps: [{ command: 'npm install -g typescript@7', seconds: 4.2 }] }, lspjson: { manualSteps: [], installSteps: [] }, host: { manualSteps: [], installSteps: [] } },
  attempts: { attempts: [{ id: 'stdio-only', args: ['--stdio'], loaded: false, pushedDiagnostics: false }] },
  correctness: { plugins: { csharp: { server: 'csharp-ls', result: { correct: 5, repeats: 5, brokenFound: 5, fixedCleared: 5, brokenNeededSave: 0, fixedNeededSave: 0, stalePushes: 0, emptyPushes: 1, brokenLatency: stats, fixedLatency: stats, mode: 'push' } } } },
  memory: [{ combination: 'plugins', worktrees: 1, servers: 3, processes: 5, megabytes: 900, samples: [{ member: 'plugins', servers: [{ name: 'csharp:csharp-ls', megabytes: 700 }] }] }],
  worktrees: { setups: { plugins: { csharp: [{ root: 'A', correct: true, outside: [], solutionInsideRoot: true }, { root: 'B', correct: false, outside: ['x'], solutionInsideRoot: false }] } }, control: [{ root: 'A', solutionsUnderRoot: ['a'], correct: false, referenceCount: 2, outside: ['b'], logLines: [] }] },
  hook: { languages: { yaml: { cold: [{ fullWaitMs: 900, missesBeforeFirstOutput: 1, firstOutputMs: 4000 }], warm: { count: 14, correct: 14, medianMs: 80, p95Ms: 120, recommendedDeadlineMs: 300 } } } },
}

test('the results render into tables with a row per set-up, language and OS', () => {
  const text = render([sample], { runUrl: 'https://example.invalid/run', head: 'abc' })
  assert.match(text, /^# Language-server set-ups spike: results/)
  assert.match(text, /CI run: https:\/\/example\.invalid\/run at abc/)
  assert.match(text, /\| plugins \| csharp \| linux \| csharp-ls \| 5\/5 \|/)
  assert.match(text, /\| linux \| plugins \| 1 \| 3 \| 5 \| 900 \|/)
  assert.match(text, /\| plugins \| csharp \| linux \| ok, own solution \| wrong, other solution \| n\/a \|/)
  assert.match(text, /\| linux \| yaml \| 14 \| 14\/14 \| 80 \| 120 \| 300 \| 900 \| 1 \| 4000 \|/)
  assert.equal(render([]).includes('No result files'), true)
})

test('error fields anywhere in a part are found with their path', () => {
  assert.deepEqual(errorsIn({ a: { b: [{ error: 'boom' }] }, c: 1 }), ['a.b.0: boom'])
  assert.deepEqual(errorsIn({ ok: true }), [])
})

test('the parts and the install log merge into one result with the developer steps per set-up', () => {
  const merged = mergeParts({ parts: { hook: { x: 1 } }, install: [{ setup: 'host', command: 'npm ci', seconds: 3 }], versionInfo: { node: 'v24' }, date: 'now' })
  assert.deepEqual(merged.setups.host.installSteps, [{ setup: 'host', command: 'npm ci', seconds: 3 }])
  assert.deepEqual(merged.setups.host.manualSteps, ['dotnet tool restore', 'npm ci'])
  assert.ok(merged.setups.plugins.manualSteps.includes('dotnet tool install --global csharp-ls'))
  assert.deepEqual(merged.hook, { x: 1 })
  assert.equal(merged.memory, null)
})

test('Roslyn launch attempts always include stdio alone and add only the load and solution flags the help lists', () => {
  const help = ['Options:', '  --stdio  Use stdio', '  --autoLoadProjects  Load projects on start', '  --logLevel <level>  Log level', '  --solutionPath <path>  Solution to open', '  --pipe <name>  Pipe'].join('\n')
  const attempts = roslynAttempts(help, '/app/Proof.slnx')
  assert.deepEqual(attempts.map((a) => a.id), ['stdio-only', 'autoLoadProjects', 'solutionPath'])
  assert.deepEqual(attempts[1].args, ['--stdio', '--autoLoadProjects'])
  assert.deepEqual(attempts[2].args, ['--stdio', '--solutionPath', '/app/Proof.slnx'])
  assert.deepEqual(roslynAttempts('', '/x').map((a) => a.id), ['stdio-only'])
})

test('latency summaries ignore missing values and report the median and p95', () => {
  assert.deepEqual(summarizeValues([NaN, null]).runs, 0)
  const summary = summarizeValues([10, 20, 30, 40, NaN])
  assert.equal(summary.runs, 4)
  assert.equal(summary.medianMs, 20)
  assert.equal(summary.p95Ms, 40)
})
