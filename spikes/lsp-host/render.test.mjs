import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from './render-results.mjs'

const result = (os, status) => ({
  os,
  versions: { 'csharp-ls': '0.28.0', roslyn: '5.13.0', typescript: '7.0.2', dotnet: '10.0.401', node: 'v24' },
  servers: {
    'csharp-ls': {
      cases: [{ id: 'rename.overload', status, reason: status === 'pass' ? '' : 'build failed', coldStartMs: 4000, details: { otherOverloads: 'left alone' } }],
      coldStart: { medianMs: 4000, minMs: 3000, maxMs: 5000, samples: 3 },
      warm: { coldStartMs: 4100, references: { runs: 25, medianMs: 12, p95Ms: 30 }, prepareRename: { runs: 25, medianMs: 8, p95Ms: 20 }, memoryAfterLoadMb: 500, memoryAfterWorkloadMb: 600 },
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
})

test('an empty folder renders a note instead of failing', () => {
  assert.match(render([]), /No result files/)
})
