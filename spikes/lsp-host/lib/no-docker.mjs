import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const schemaFixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'generated', 'schema.d.ts')

export function withoutDocker(run, platform = process.platform) {
  return (command, args, cwd) => {
    if (platform !== 'linux' && command === 'npm' && args.join(' ') === 'run api:types') {
      copyFileSync(schemaFixture, join(cwd, 'src', 'shared', 'api', 'schema.d.ts'))
      return Promise.resolve()
    }
    return run(command, args, cwd)
  }
}
