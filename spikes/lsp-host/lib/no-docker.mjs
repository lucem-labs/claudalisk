import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const schemaFixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'generated', 'schema.d.ts')

export function containerRuntimeAnswers(spawn = spawnSync) {
  try {
    const result = spawn('docker', ['info', '--format', '{{.OSType}}'], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    return result.status === 0 && String(result.stdout).trim() === 'linux'
  } catch {
    return false
  }
}

export function withoutDocker(run, available = containerRuntimeAnswers, log = (line) => process.stderr.write(`${line}\n`)) {
  let answered
  return (command, args, cwd) => {
    if (command === 'npm' && args.join(' ') === 'run api:types') {
      answered ??= available()
      if (!answered) {
        log('no Linux container runtime answers: api:types is replaced by the committed schema in fixtures/generated/schema.d.ts')
        copyFileSync(schemaFixture, join(cwd, 'src', 'shared', 'api', 'schema.d.ts'))
        return Promise.resolve()
      }
    }
    return run(command, args, cwd)
  }
}
