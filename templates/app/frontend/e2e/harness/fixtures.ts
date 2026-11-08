import { test as base } from '@playwright/test'
import { startWorkerApi } from './api.mjs'

type WorkerApi = Awaited<ReturnType<typeof startWorkerApi>>

export const test = base.extend<{ startWorkers: () => Promise<WorkerApi> }>({
  startWorkers: async ({ browserName: _ }, use) => {
    const started: WorkerApi[] = []
    await use(async () => {
      const api = await startWorkerApi()
      started.push(api)
      return api
    })
    await Promise.all(started.map((api) => api.stop()))
  },
})

export { expect } from '@playwright/test'
