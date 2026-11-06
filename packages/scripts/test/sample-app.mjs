export const sampleConfig = {
  name: 'shop',
  hostPrefix: 'shop',
  repo: 'acme/shop',
  databases: [{ role: 'app', envVar: 'ConnectionStrings__Shop' }],
  ports: { devDb: 5440, apiLocal: 5180 },
  uat: { composeProject: 'shop-uat', volume: 'shop-uat_postgres-data', protectedVolumes: [] },
  backup: { keep: 5 },
}

export const sampleApp = { ...sampleConfig, root: '/repo' }

export const twoDatabaseApp = {
  ...sampleApp,
  databases: [
    { role: 'app', envVar: 'ConnectionStrings__Shop' },
    { role: 'identity', envVar: 'ConnectionStrings__Identity' },
  ],
}

export const sampleValues = { POSTGRES_DB: 'shop', POSTGRES_USER: 'app', POSTGRES_PASSWORD: 'pw' }
