import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { check, checkE2eLocators, findViolations, format, sourceFiles } from './check-e2e-locators.mjs';

const captured = (action) => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    return { code: action(), lines };
  } finally {
    console.log = original;
  }
};

const ALLOWED = `import { test, expect } from '@playwright/test';

test('cancels an order', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
");
  await page.getByLabel('Reason', { exact: true }).fill('Changed my mind');
  await page.getByTestId('order-row').filter({ hasText: 'Open' }).getByRole('link', { name: 'Open', exact: true }).hover();
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await page.mouse.click(10, 10);
  await page.mouse.dblclick(10, 10);
  await page.touchscreen.tap(10, 10);
  await loginPage.fill('alice');
  await cartPage.check();
  await expect(page.getByRole('status')).toHaveText('Cancelled');
});
`;

test('findViolations accepts role, label and test id locators and input devices', () => {
  assert.deepEqual(findViolations(ALLOWED), []);
});

test('findViolations rejects locator() with a class or element selector, with its line and column', () => {
  const found = findViolations("await page.locator('.btn-primary').click();\nawait row.locator('td > span').hover();");
  assert.deepEqual(found.map(({ line, col }) => [line, col]), [[1, 11], [2, 10]]);
  assert.match(found[0].message, /getByRole/);
});

test('findViolations rejects locators written across lines and inside filter', () => {
  const text = "await page\n  .locator('.row')\n  .click();\nawait rows.filter({ has: page.locator('.x') }).click();";
  assert.deepEqual(findViolations(text).map((v) => v.line), [2, 4]);
});

test('findViolations rejects frameLocator, the $ family, waitForSelector and querySelector', () => {
  const text = [
    "await page.frameLocator('iframe.pay').getByRole('button').click();",
    "await page.$('.row');",
    "await page.$$('li');",
    "await page.$eval('#id', (e) => e.textContent);",
    "await page.$$eval('tr', (rows) => rows.length);",
    "await page.waitForSelector('.loaded');",
    "await page.evaluate(() => document.querySelectorAll('tr').length);",
  ].join('\n');
  assert.deepEqual(findViolations(text).map((v) => v.line), [1, 2, 3, 4, 5, 6, 7]);
});

test('findViolations rejects selector methods on pages, frames and popups', () => {
  const text = [
    "await page.click('button.save');",
    "await page.fill('input[name=q]', 'x');",
    "await frame.isVisible('div');",
    "await this.page.press('#q', 'Enter');",
    "await popup.click('.ok');",
    "await newPage.hover('nav a');",
  ].join('\n');
  assert.deepEqual(findViolations(text).map((v) => v.line), [1, 2, 3, 4, 5, 6]);
});

test('format writes a GitHub annotation in Actions and a file:line:col message elsewhere', () => {
  const v = { file: 'frontend/e2e/a,b:c.spec.ts', line: 4, col: 7, message: 'Use `getByRole`, then 100%' };
  assert.equal(format(v, false), 'frontend/e2e/a,b:c.spec.ts:4:7: Use `getByRole`, then 100%');
  assert.equal(format(v, true), '::error file=frontend/e2e/a%2Cb%3Ac.spec.ts,line=4,col=7,title=E2E locator::Use `getByRole`, then 100%25');
});

test('without a folder the command checks frontend/e2e under the app root', () => {
  const repo = mkdtempSync(join(tmpdir(), 'e2e-locators-'));
  mkdirSync(join(repo, 'frontend', 'e2e'), { recursive: true });
  writeFileSync(join(repo, 'frontend', 'e2e', 'bad.spec.ts'), "await page.locator('.x').click();\n");
  const { code, lines } = captured(() => checkE2eLocators({ appRoot: repo, argv: [], env: {} }));
  assert.equal(code, 1);
  assert.ok(lines[0].startsWith('frontend/e2e/bad.spec.ts:1:11: '));
});

test('check reports each violation relative to the root and skips node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-locators-'));
  const e2e = join(root, 'frontend', 'e2e');
  mkdirSync(join(e2e, 'support'), { recursive: true });
  mkdirSync(join(e2e, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(e2e, 'orders.spec.ts'), ALLOWED);
  writeFileSync(join(e2e, 'support', 'helpers.ts'), "export const row = (page) => page.locator('.row');\n");
  writeFileSync(join(e2e, 'node_modules', 'pkg', 'index.js'), "page.locator('.x');\n");
  writeFileSync(join(e2e, 'README.md'), "page.locator('.x')\n");
  assert.equal(sourceFiles(e2e).length, 2);
  const lines = [];
  assert.equal(check(e2e, { root, github: false, write: (l) => lines.push(l) }), 1);
  assert.deepEqual(lines.map((l) => l.split(': ')[0]), ['frontend/e2e/support/helpers.ts:1:34']);
});

test('check passes a clean folder and returns 2 for a missing folder or a file', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-locators-'));
  writeFileSync(join(root, 'clean.spec.ts'), ALLOWED);
  const errors = [];
  assert.equal(check(root, { root, write: () => {}, error: (l) => errors.push(l) }), 0);
  assert.equal(check(join(root, 'missing'), { root, github: false, write: () => {}, error: (l) => errors.push(l) }), 2);
  assert.equal(check(join(root, 'clean.spec.ts'), { root, github: true, write: () => {}, error: (l) => errors.push(l) }), 2);
  assert.match(errors[0], /missing is not a folder$/);
  assert.match(errors[1], /^::error title=E2E locator::/);
});

test('the command checks a folder given relative to the current directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-locators-'));
  writeFileSync(join(root, 'bad.spec.ts'), "await page.locator('.x').click();\n");
  const { code, lines } = captured(() => checkE2eLocators({ appRoot: root, argv: [relative(process.cwd(), root)], env: {} }));
  assert.equal(code, 1);
  assert.match(lines[0], /bad\.spec\.ts:1:11/);
});

test('the command annotates in GitHub Actions', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-locators-'));
  writeFileSync(join(root, 'bad.spec.ts'), "await page.locator('.x').click();\n");
  const { lines } = captured(() => checkE2eLocators({ appRoot: root, argv: [root], env: { GITHUB_ACTIONS: 'true' } }));
  assert.match(lines[0], /^::error file=bad\.spec\.ts,line=1,col=11,title=E2E locator::/);
});
