import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from './render-results.mjs'

const result = (os, status) => ({
  os,
  versions: { 'csharp-ls': '0.28.0', roslyn: '5.13.0', typescript: '7.0.2', dotnet: '10.0.401', node: 'v24' },
  servers: {
    'csharp-ls': {
      cases: [{ id: 'rename.overload', status, reason: status === 'pass' ? '' : 'build failed', coldStartMs: 4000, details: { otherOverloads: 'left alone' }, verification: { runs: 2, buildMs: 4000, testMs: 1000, ran: ['A.Tests'], skipped: ['B.Tests'] } }],
      coldStart: { medianMs: 4000, minMs: 3000, maxMs: 5000, samples: 3 },
      warm: { capabilities: { renameProvider: { prepareProvider: true }, callHierarchyProvider: true, codeActionProvider: { codeActionKinds: ['quickfix'] } }, coldStartMs: 4100, references: { runs: 25, medianMs: 12, p95Ms: 30 }, prepareRename: { runs: 25, medianMs: 8, p95Ms: 20 }, memoryAfterLoadMb: 500, memoryAfterWorkloadMb: 600, referenceShapes: { plain: { medianMs: 12, p95Ms: 30 }, partialResultToken: { medianMs: 9, p95Ms: 20, items: { returned: 0, streamed: 6 } } } },
      memoryAfterCasesMb: 700,
    },
  },
})

test('the table has one column per OS and a reason for every case that did not pass', () => {
  const markdown = render([result('linux', 'pass'), result('windows', 'fail')])
  assert.ok(markdown.includes('| Case | linux | windows |'))
  assert.ok(markdown.includes('| rename.overload | pass | fail |'))
  assert.ok(markdown.includes('`rename.overload` on windows (fail): build failed'))
  assert.ok(markdown.includes('| csharp-ls | linux | 4000 | 3000 | 5000 | 3 | 4100 |'))
  assert.ok(markdown.includes('| csharp-ls | windows | 12 | 30 | 8 | 20 | 25 |'))
  assert.ok(markdown.includes('| csharp-ls | yes | yes | no | no | quickfix | no | none |'))
  assert.ok(markdown.includes('| csharp-ls | linux | 12 (30) | 9 (20) | n/a | n/a | 0 / 6 |'))
  assert.ok(markdown.includes('| csharp-ls | linux | 2 | 2000 | 500 | A.Tests | B.Tests |'))
})

test('an empty folder renders a note instead of failing', () => {
  assert.match(render([]), /No result files/)
})
