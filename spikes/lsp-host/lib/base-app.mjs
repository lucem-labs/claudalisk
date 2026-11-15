import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAsync, serve } from '../../../tools/check-registry.mjs'
import { generateApp } from '../../../tools/new-app.mjs'
import { builtRegistry, readJson, repositoryRoot } from '../../../tools/registry.mjs'

export const ROOT = 'Proof'
export const NAME = 'proof-app'

export async function generateBaseApp(work) {
  const app = join(work, 'base')
  const home = join(work, 'generate-home')
  mkdirSync(home, { recursive: true })
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'claudalisk',
    GIT_AUTHOR_EMAIL: 'claudalisk@example.com',
    GIT_COMMITTER_NAME: 'claudalisk',
    GIT_COMMITTER_EMAIL: 'claudalisk@example.com',
  })
  const server = await serve(builtRegistry)
  try {
    const scripts = join(repositoryRoot, 'packages', 'scripts')
    const { version } = readJson(join(scripts, 'package.json'))
    await runAsync('npm', ['pack', '--pack-destination', work], scripts)
    const scriptsPackage = join(work, `claudalisk-scripts-${version}.tgz`).replaceAll(String.fromCharCode(92), '/')
    if (!existsSync(scriptsPackage)) throw new Error(`npm pack did not write ${scriptsPackage}`)
    const registry = `http://127.0.0.1:${server.address().port}/{name}.json`
    await generateApp(
      { target: app, root: ROOT, name: NAME, repo: `lucem-labs/${NAME}`, module: 'Ordering', aggregate: 'Order', registry, skill: false, scriptsPackage },
      { run: runAsync, home },
    )
  } finally {
    server.close()
  }
  return app
}

export function newWorkFolder(prefix = 'lsp-host-') {
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
}
