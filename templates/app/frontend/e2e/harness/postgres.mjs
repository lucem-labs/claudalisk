import { PostgreSqlContainer } from '@testcontainers/postgresql'

const POSTGRES_IMAGE = 'postgres:18-alpine'

export async function startPostgres(port) {
  const builder = new PostgreSqlContainer(POSTGRES_IMAGE)
  const container = await (port ? builder.withExposedPorts({ container: 5432, host: port }) : builder).start()
  return {
    connectionString: `Host=${container.getHost()};Port=${container.getPort()};Database=${container.getDatabase()};Username=${container.getUsername()};Password=${container.getPassword()}`,
    stop: () => container.stop(),
  }
}
