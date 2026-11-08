import { defineConfig, devices } from '@playwright/test'

const webPort = process.env.E2E_WEB_PORT
if (!webPort) throw new Error('Run the end-to-end tests with npm run e2e, which starts their stack.')
const project = process.env.E2E_PROJECT ?? 'all'
const browser = devices['Desktop Chrome']

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  outputDir: `test-results/${project}`,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: `playwright-report/${project}` }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'parallel', fullyParallel: true, grepInvert: /@serial/, use: browser },
    { name: 'serial', workers: 1, fullyParallel: false, grep: /@serial/, use: browser },
  ],
})
