import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  failuresFromOutput,
  failuresFromPlaywright,
  failuresFromTrx,
  failuresFromVitest,
  parseArgs,
  plan,
  quoteForWindowsShell,
  stateFolder,
  summarize,
  verify,
} from './verify.mjs';

const TRX = `<?xml version="1.0" encoding="utf-8"?>
<TestRun>
  <Results>
    <UnitTestResult testName="Orders.CancelOrderTests.Cancels_an_open_order" outcome="Passed" />
    <UnitTestResult testName="Orders.CancelOrderTests.Refuses_a_shipped_order" outcome="Failed">
      <Output>
        <ErrorInfo>
          <Message>Assert.Equal() Failure: Values differ
Expected: &quot;Cancelled&quot;
Actual:   &quot;Shipped&quot;</Message>
          <StackTrace>   at Orders.CancelOrderTests.Refuses_a_shipped_order() in CancelOrderTests.cs:line 42
   at System.RuntimeMethodHandle.InvokeMethod()
   at more.frames()</StackTrace>
        </ErrorInfo>
      </Output>
    </UnitTestResult>
    <UnitTestResult testName="Orders.CancelOrderTests.Skipped" outcome="NotExecuted" />
  </Results>
</TestRun>`;

const VITEST = {
  numPassedTests: 4,
  testResults: [
    { name: '/app/src/entities/order/model/store.test.ts', status: 'failed', assertionResults: [
      { fullName: 'order store adds a line', status: 'passed', failureMessages: [] },
      { fullName: 'order store removes a line', status: 'failed', failureMessages: ['AssertionError: expected 2 to be 1\n    at file:///app/node_modules/@vitest/runner/dist/index.js:1:1\n    at store.test.ts:18:5'] },
    ] },
    { name: '/app/src/shared/lib/broken.test.ts', status: 'failed', message: 'SyntaxError: Unexpected token', assertionResults: [] },
  ],
};

const PLAYWRIGHT = {
  suites: [{
    title: 'orders.spec.ts',
    specs: [
      { title: 'creates an order', tests: [{ status: 'expected', projectName: 'chromium', results: [{ status: 'passed' }] }] },
      { title: 'cancels an order', tests: [{ status: 'unexpected', projectName: 'chromium', results: [{ status: 'failed', error: { message: 'Error: expect(locator).toBeVisible() failed\nLocator: getByRole(\'button\')' } }] }] },
    ],
    suites: [{ title: 'when shipped', specs: [{ title: 'hides cancel', tests: [{ status: 'flaky', results: [] }] }] }],
  }],
  errors: [],
};

function app({ backend = true, frontend = { build: 'tsc -b && vite build', lint: 'oxlint && steiger src' } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'verify-app-'));
  if (backend) mkdirSync(join(root, 'backend'));
  if (frontend) {
    mkdirSync(join(root, 'frontend'));
    writeFileSync(join(root, 'frontend', 'package.json'), JSON.stringify({ scripts: frontend }));
  }
  return root;
}

test('parseArgs defaults to backend and frontend, and takes layer flags', () => {
  assert.deepEqual(parseArgs([]), { layers: ['backend', 'frontend'], explicit: false });
  assert.deepEqual(parseArgs(['--e2e', '--backend']), { layers: ['backend', 'e2e'], explicit: true });
  assert.deepEqual(parseArgs(['--all']), { layers: ['backend', 'frontend', 'e2e'], explicit: true });
  assert.throws(() => parseArgs(['--fast']), /Unknown argument: --fast/);
  assert.throws(() => parseArgs(['backend']), /Usage/);
});

test('stateFolder is per app and worktree in the env-state folder', () => {
  assert.equal(stateFolder({ home: '/home/me', app: 'shop', worktree: 'shop-95' }), join('/home/me', '.claudalisk', 'apps', 'shop', 'verify', 'shop-95'));
});

test('plan builds and tests the backend with a TRX report outside the checkout', () => {
  const root = app();
  const { steps } = plan({ root, layers: ['backend'], explicit: true, state: '/state' });
  assert.deepEqual(steps.map((s) => [s.layer, s.name, s.command, s.args[0]]), [['backend', 'build', 'dotnet', 'build'], ['backend', 'tests', 'dotnet', 'test']]);
  assert.ok(steps[1].args.includes('--no-build'));
  assert.deepEqual(steps[1].args.slice(-4), ['--logger', 'trx', '--results-directory', join('/state', 'trx')]);
  assert.equal(steps[1].needs, 'build');
});

test('plan runs the frontend build and lint scripts that exist, then Vitest with a JSON report', () => {
  const root = app({ frontend: { build: 'vite build' } });
  const { steps } = plan({ root, layers: ['frontend'], explicit: true, state: '/state' });
  assert.deepEqual(steps.map((s) => s.name), ['build', 'tests']);
  assert.deepEqual(steps[1].args.slice(0, 6), ['exec', '--no', '--', 'vitest', 'run', '--reporter=json']);
  assert.equal(steps[1].reportPath, join('/state', 'vitest.json'));
});

test('plan runs Playwright with its JSON report path in the environment', () => {
  const { steps } = plan({ root: app(), layers: ['e2e'], explicit: true, state: '/state' });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].env.PLAYWRIGHT_JSON_OUTPUT_FILE, join('/state', 'playwright.json'));
});

test('plan fails a requested layer that is missing and skips a default one', () => {
  const root = app({ backend: false });
  assert.deepEqual(plan({ root, layers: ['backend'], explicit: true, state: '/s' }).missing, ['backend: no backend/ folder']);
  const defaults = plan({ root, layers: ['backend', 'frontend'], explicit: false, state: '/s' });
  assert.deepEqual(defaults.missing, []);
  assert.deepEqual(defaults.skipped, ['backend: no backend/ folder']);
});

test('failuresFromTrx counts passes and keeps the message and the top of the stack of each failure', () => {
  const { passed, failures } = failuresFromTrx(TRX);
  assert.equal(passed, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, 'Orders.CancelOrderTests.Refuses_a_shipped_order');
  assert.match(failures[0].message, /^Assert\.Equal\(\) Failure: Values differ\nExpected: "Cancelled"\nActual: {3}"Shipped"\n {3}at Orders/);
  assert.doesNotMatch(failures[0].message, /more\.frames/);
});

test('failuresFromVitest reports failed tests and files that failed to load', () => {
  const { passed, failures } = failuresFromVitest(VITEST);
  assert.equal(passed, 4);
  assert.deepEqual(failures.map((f) => f.name), ['order store removes a line', '/app/src/shared/lib/broken.test.ts']);
  assert.equal(failures[0].message, 'AssertionError: expected 2 to be 1\n    at store.test.ts:18:5');
  assert.equal(failures[1].message, 'SyntaxError: Unexpected token');
});

test('failuresFromPlaywright names each unexpected test by its suites and project', () => {
  const { passed, failures } = failuresFromPlaywright(PLAYWRIGHT);
  assert.equal(passed, 2);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, 'orders.spec.ts › cancels an order [chromium]');
  assert.match(failures[0].message, /toBeVisible/);
});

test('failuresFromOutput keeps compiler and linter error lines once each', () => {
  const output = [
    'Restore complete',
    'Orders/Cancel.cs(12,5): error CS1002: ; expected [Orders.csproj]',
    'src/app.tsx(3,1): error TS2322: Type string is not assignable to type number.',
    '  × eslint(no-unused-vars): Variable x is declared but never used.',
    'Orders/Cancel.cs(12,5): error CS1002: ; expected [Orders.csproj]',
    'Build FAILED.',
  ].join('\r\n');
  assert.deepEqual(failuresFromOutput(output).failures.map((f) => f.name), [
    'Orders/Cancel.cs(12,5): error CS1002: ; expected [Orders.csproj]',
    'src/app.tsx(3,1): error TS2322: Type string is not assignable to type number.',
    '× eslint(no-unused-vars): Variable x is declared but never used.',
  ]);
});

test('failuresFromOutput falls back to the last lines when it finds no error line', () => {
  const output = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
  const [failure] = failuresFromOutput(output).failures;
  assert.equal(failure.message.split('\n').length, 20);
  assert.match(failure.message, /^line 10\n[\s\S]*line 29$/);
});

test('summarize prints one line per step and details only for failures', () => {
  const step = (layer, name) => ({ layer, name });
  const { text, ok } = summarize({
    results: [
      { step: step('backend', 'build'), ok: true, failures: [] },
      { step: step('backend', 'tests'), ok: false, passed: 1, failures: [{ name: 'A.test', message: 'boom' }] },
    ],
    logPath: '/state/verify.log',
  });
  assert.equal(ok, false);
  assert.equal(text, '✓ backend build\n✗ backend tests (1 passed, 1 failed)\n\n✗ backend tests\n  A.test\n    boom\n\nverify: 1 step(s) failed. Full log: /state/verify.log');
});

test('summarize says all green and stays short when nothing failed', () => {
  const { text, ok } = summarize({ results: [{ step: { layer: 'frontend', name: 'tests' }, ok: true, passed: 12, failures: [] }], skipped: ['backend: no backend/ folder'], logPath: '/l' });
  assert.equal(ok, true);
  assert.equal(text, '✓ frontend tests (12 passed)\n- backend: no backend/ folder, skipped\n\nverify: all green. Full log: /l');
});

test('summarize caps the output and points to the full log', () => {
  const failures = Array.from({ length: 200 }, (_, i) => ({ name: `Test ${i}`, message: 'x'.repeat(200) }));
  const { text } = summarize({ results: [{ step: { layer: 'backend', name: 'tests' }, ok: false, passed: 0, failures }], logPath: '/l', limit: 4000 });
  assert.ok(text.length <= 4000, `${text.length} characters`);
  assert.match(text, /cut; grep the full log/);
  assert.match(text, /Full log: \/l$/);
});

test('quoteForWindowsShell quotes arguments with spaces and shell characters', () => {
  assert.equal(quoteForWindowsShell('--outputFile=C:\\Users\\A B\\v.json'), '"--outputFile=C:\\Users\\A B\\v.json"');
  assert.equal(quoteForWindowsShell('run'), 'run');
});

test('verify runs each step once, skips tests after a failed build, logs everything and prints only failures', () => {
  const root = app({ frontend: { lint: 'oxlint' } });
  const home = mkdtempSync(join(tmpdir(), 'verify-home-'));
  const calls = [];
  const printed = [];
  const run = (step) => {
    calls.push(`${step.layer} ${step.name}`);
    if (step.layer === 'backend') return { status: 1, output: 'Cancel.cs(1,1): error CS1002: ; expected\nBuild FAILED.' };
    if (step.name === 'tests') {
      writeFileSync(step.reportPath, JSON.stringify(VITEST));
      return { status: 1, output: 'vitest noise '.repeat(1000) };
    }
    return { status: 0, output: 'lint ok' };
  };
  const code = verify({ root, argv: [], home, names: { app: 'shop', worktree: 'shop-95' }, run, write: (t) => printed.push(t) });
  assert.equal(code, 1);
  assert.deepEqual(calls, ['backend build', 'frontend lint', 'frontend tests']);
  const [text] = printed;
  assert.match(text, /✗ backend build\n- backend tests: skipped, build failed\n✓ frontend lint\n✗ frontend tests \(4 passed, 2 failed\)/);
  assert.match(text, /error CS1002/);
  assert.match(text, /order store removes a line/);
  assert.doesNotMatch(text, /vitest noise/);
  const logPath = join(stateFolder({ home, app: 'shop', worktree: 'shop-95' }), 'verify.log');
  assert.ok(text.endsWith(`Full log: ${logPath}`));
  assert.match(readFileSync(logPath, 'utf8'), /vitest noise/);
});

test('verify returns 0 when every step is green', () => {
  const root = app({ frontend: false });
  const home = mkdtempSync(join(tmpdir(), 'verify-home-'));
  const code = verify({ root, argv: ['--backend'], home, names: { app: 'a', worktree: 'a' }, run: () => ({ status: 0, output: '' }), write: () => {} });
  assert.equal(code, 0);
});
