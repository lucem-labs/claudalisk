import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { annotations, failedTests, location, report, summary, trxAnnotations } from './trx-annotations.mjs';

const TRX = `<?xml version="1.0" encoding="utf-8"?>
<TestRun>
  <Results>
    <UnitTestResult testName="Ordering.CancelOrderTests.Cancels_an_open_order" outcome="Passed" />
    <UnitTestResult testName="Ordering.CancelOrderTests.Refuses_a_shipped_order" outcome="Failed">
      <Output>
        <ErrorInfo>
          <Message>Assert.Equal() Failure: Values differ
Expected: &quot;Cancelled&quot;
Actual:   &quot;Shipped&quot;</Message>
          <StackTrace>   at Xunit.Assert.Equal() in /_/src/Assert.cs:line 9
   at Ordering.CancelOrderTests.Refuses_a_shipped_order() in /home/runner/work/shop/shop/backend/Ordering.Tests/CancelOrderTests.cs:line 42</StackTrace>
        </ErrorInfo>
      </Output>
    </UnitTestResult>
    <UnitTestResult testName="Ordering.CancelOrderTests.Skipped" outcome="NotExecuted" />
  </Results>
</TestRun>`;

const WORKSPACE = '/home/runner/work/shop/shop';

test('location takes the first stack frame inside the workspace, relative to it', () => {
  assert.deepEqual(location(' at A() in /_/src/Assert.cs:line 9\n at B() in /home/runner/work/shop/shop/backend/B.cs:line 3', WORKSPACE), { file: 'backend/B.cs', line: 3 });
  assert.deepEqual(location(' at B() in D:\\a\\shop\\shop\\backend\\B.cs:line 3', 'D:\\a\\shop\\shop'), { file: 'backend/B.cs', line: 3 });
  assert.equal(location(' at A() in /_/src/Assert.cs:line 9', WORKSPACE), null);
});

test('summary escapes backslashes before pipes so a table cell cannot be broken out of', () => {
  const text = summary([{ name: 'a\\|b', message: 'c:\\d|e' }], 0);
  assert.ok(text.includes('| a\\\\\\|b |  | c:\\\\d\\|e |'));
});

test('failedTests counts passes and keeps each failure with its message and location', () => {
  const { passed, failures } = failedTests(TRX, WORKSPACE);
  assert.equal(passed, 1);
  assert.deepEqual(failures, [{
    name: 'Ordering.CancelOrderTests.Refuses_a_shipped_order',
    message: 'Assert.Equal() Failure: Values differ\nExpected: "Cancelled"\nActual:   "Shipped"',
    file: 'backend/Ordering.Tests/CancelOrderTests.cs',
    line: 42,
  }]);
});

test('annotations escape workflow command data and properties', () => {
  assert.deepEqual(annotations([{ name: 'A.B(x: 1, y: 2)', message: '100% wrong\nline two', file: 'backend/A.cs', line: 4 }]), [
    '::error file=backend/A.cs,line=4,title=A.B(x%3A 1%2C y%3A 2)::100%25 wrong%0Aline two',
  ]);
});

test('annotations stay within the step limit and name the rest in the last one', () => {
  const failures = Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, message: 'm' }));
  const lines = annotations(failures);
  assert.equal(lines.length, 10);
  assert.equal(lines[8], '::error title=T8::m');
  assert.equal(lines[9], '::error title=3 more failing tests::T9%0AT10%0AT11');
});

test('summary is a markdown table of the failures', () => {
  assert.equal(summary([{ name: 'A|B', message: 'x\ny', file: 'a.cs', line: 1 }], 3), '### .NET tests: 3 passed, 1 failed\n\n| Test | Where | Message |\n|---|---|---|\n| A\\|B | a.cs:1 | x |\n');
});

test('report reads every TRX file in the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trx-'));
  writeFileSync(join(dir, 'a.trx'), TRX);
  writeFileSync(join(dir, 'b.trx'), TRX);
  writeFileSync(join(dir, 'notes.txt'), 'ignored');
  const out = [];
  const summaries = [];
  report(dir, { workspace: WORKSPACE, write: (l) => out.push(l), appendSummary: (s) => summaries.push(s) });
  assert.equal(out.length, 2);
  assert.match(out[0], /^::error file=backend\/Ordering.Tests\/CancelOrderTests.cs,line=42,title=Ordering.CancelOrderTests.Refuses_a_shipped_order::Assert/);
  assert.match(summaries[0], /2 passed, 2 failed/);
});

test('report leaves a notice when there is no TRX folder', () => {
  const out = [];
  report(join(tmpdir(), 'no-such-trx-folder'), { write: (l) => out.push(l) });
  assert.match(out[0], /^::notice title=No TRX reports::/);
});

test('the command needs a results folder and returns 2 without one', () => {
  const original = console.error;
  const messages = [];
  console.error = (line) => messages.push(line);
  try {
    assert.equal(trxAnnotations({ argv: [], env: {} }), 2);
  } finally {
    console.error = original;
  }
  assert.match(messages[0], /^Usage: node scripts\/trx-annotations\.mjs/);
});

test('the command writes the job summary to GITHUB_STEP_SUMMARY', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trx-'));
  writeFileSync(join(dir, 'a.trx'), TRX);
  const summaryFile = join(dir, 'summary.md');
  const original = console.log;
  console.log = () => {};
  try {
    assert.equal(trxAnnotations({ argv: [dir], env: { GITHUB_STEP_SUMMARY: summaryFile, GITHUB_WORKSPACE: WORKSPACE } }), 0);
  } finally {
    console.log = original;
  }
  assert.match(readFileSync(summaryFile, 'utf8'), /1 passed, 1 failed/);
});
