import { freePorts } from './ports.mjs'
import { startUntilLogged } from './processes.mjs'

export const LISTENING = /Now listening on:/

export function apiEnvironment({ connectionString, port, workers, extra = {} }) {
  return {
    ...process.env,
    ...extra,
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
    ConnectionStrings__Default: connectionString,
    Jobs__WorkersEnabled: String(workers),
    Scheduling__Enabled: String(workers),
  }
}

export function startApi({ dll, connectionString, port, workers, extra }) {
  return startUntilLogged({
    name: workers ? 'The API with workers' : 'The API',
    command: 'dotnet',
    args: [dll],
    options: { env: apiEnvironment({ connectionString, port, workers, extra }) },
    ready: LISTENING,
  })
}

export async function startWorkerApi(env = process.env) {
  const [port] = await freePorts(1)
  const api = await startApi({
    dll: env.E2E_API_DLL,
    connectionString: env.E2E_CONNECTION_STRING,
    port,
    workers: true,
    extra: JSON.parse(env.E2E_API_EXTRA_ENV),
  })
  return { ...api, url: `http://127.0.0.1:${port}` }
}
