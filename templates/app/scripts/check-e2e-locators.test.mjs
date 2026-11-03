import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, findViolations, format, sourceFiles } from './check-e2e-locators.mjs';

const ALLOWED = `import { test, expect } from '@playwright/test';

test('cancels an order', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Changed my mind');
  await page.getByTestId('order-row').first().hover();
  await page.keyboard.type('Enter');
  await page.mouse.click(10, 10);
  await expect(page.getByRole('status')).toHaveText('Cancelled');
});
`;

test('findViolations accepts role, label and test id locators', () => {
  assert.deepEqual(findViolations(ALLOWED), []);
});

test('findViolations rejects locator() with a class or element selector', () => {
  const found = findViolations("await page.locator('.btn-primary').click();\nawait row.locator('td > span').hover();");
  assert.deepEqual(found.map((v) => v.line), [1, 2]);
  assert.match(found[0].message, /getByRole/);
});

test('findViolations rejects the $ family, waitForSelector and querySelector', () => {
  const text = [
    "await page.$('.row');",
    "await page.$$('li');",
    "await page.$eval('#id', (e) => e.textContent);",
    "await page.$$eval('tr', (rows) => rows.length);",
    "await page.waitForSelector('.loaded');",
    "await page.evaluate(() => document.querySelectorAll('tr').length);",
  ].join('\n');
  assert.deepEqual(findViolations(text).map((v) => v.line), [1, 2, 3, 4, 5, 6]);
});

test('findViolations rejects page and frame methods that take a selector', () => {
  const text = "await page.click('button.save');\nawait page.fill('input[name=q]', 'x');\nawait frame.isVisible('div');";
  assert.deepEqual(findViolations(text).map((v) => v.line), [1, 2, 3]);
});

test('format writes a GitHub annotation in Actions and a file:line message elsewhere', () => {
  const v = { file: 'frontend/e2e/orders.spec.ts', line: 4, message: 'Use `getByRole`, then 100%' };
  assert.equal(format(v, false), 'frontend/e2e/orders.spec.ts:4: Use `getByRole`, then 100%');
  assert.equal(format(v, true), '::error file=frontend/e2e/orders.spec.ts,line=4,title=E2E locator::Use `getByRole`, then 100%25');
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
  assert.deepEqual(lines.map((l) => l.split(': ')[0]), ['frontend/e2e/support/helpers.ts:1']);
});

test('check passes a clean folder and returns 2 for a missing one', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-locators-'));
  writeFileSync(join(root, 'clean.spec.ts'), ALLOWED);
  assert.equal(check(root, { root, write: () => {} }), 0);
  assert.equal(check(join(root, 'missing'), { root, write: () => {} }), 2);
});
