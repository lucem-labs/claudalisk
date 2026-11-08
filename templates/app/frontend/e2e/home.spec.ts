import { expect, test } from './harness/fixtures'

test('the home page renders in the app shell and shows the API status', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.getByText('API status: ok')).toBeVisible()
  await expect(page.getByText('E2E', { exact: true })).toBeVisible()
})
