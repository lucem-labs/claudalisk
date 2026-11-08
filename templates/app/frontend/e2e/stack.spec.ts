import { expect, test } from './harness/fixtures'

test('the API answers through the web server', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)
})
