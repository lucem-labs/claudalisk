import { OS_ASSIGNED } from './ports.mjs'
import { startUntilLogged } from './processes.mjs'

export const LISTENING = /Now listening on:\s*(?<url>https?:\/\/[^\s"']+)/

export function apiEnvironment({ connectionString, port = OS_ASSIGNED, workers, extra = {} }) {
  return {
    ...process.env,
    ...extra,
    ASPNETCORE_ENVIRONMENT: 'Development',
    APP_ENVIRONMENT: 'e2e',
    ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
    ConnectionStrings__Default: connectionString,
    Jobs__WorkersEnabled: String(workers),
    Scheduling__Enabled: String(workers),
  }
}

export async function startApi({ dll, connectionString, port, workers, extra }) {
  const api = await startUntilLogged({
    name: workers ? 'The API with workers' : 'The API',
    command: 'dotnet',
    args: [dll],
    options: { env: apiEnvironment({ connectionString, port, workers, extra }) },
    ready: LISTENING,
  })
  return { ...api, url: new URL(api.url).origin }
}

export async function startWorkerApi(env = process.env) {
  return startApi({
    dll: env.E2E_API_DLL,
    connectionString: env.E2E_CONNECTION_STRING,
    workers: true,
    extra: JSON.parse(env.E2E_API_EXTRA_ENV),
  })
}
