import { createHash } from 'node:crypto'

export function isMigrationFile(path) {
  const segments = path.replace(/\\/g, '/').split('/')
  const file = segments.at(-1)
  return segments[0] === 'backend'
    && segments.slice(1, -1).includes('Migrations')
    && file.endsWith('.cs')
    && !segments.some((segment) => segment.endsWith('.Tests'))
    && !file.endsWith('.Designer.cs')
    && !file.endsWith('ModelSnapshot.cs')
}

export function migrationIdsOf(path, text) {
  const declared = [...text.matchAll(/\[Migration\("(\d{14}_[A-Za-z0-9_]+)"\)\]/g)].map((match) => match[1])
  if (declared.length > 0) return declared
  const named = /(\d{14}_[A-Za-z0-9_]+)\.cs$/.exec(path.replace(/\\/g, '/'))?.[1]
  return named ? [named] : []
}

export function fingerprints(files) {
  const migrations = new Map()
  for (const { path, text } of files) {
    const normal = text.replace(/\r\n/g, '\n')
    const hash = createHash('sha256').update(normal).digest('hex')
    for (const id of migrationIdsOf(path, normal)) migrations.set(id, hash)
  }
  return migrations
}
