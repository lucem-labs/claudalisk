import { parseOptions } from '../cli.mjs'
import { checkAgainstMain, fetchMain, pasteEntries, readApprovedEdits, readMainMigrations, readMergeBaseMigrations, sourceMigrations } from '../migration-checks.mjs'

export async function checkMigrationsAgainstMain({ appRoot, argv, runner }) {
  parseOptions({}, argv)
  await fetchMain(runner, appRoot)
  const main = await readMainMigrations(runner, appRoot)
  const base = (await readMergeBaseMigrations(runner, appRoot)) ?? main
  const approved = await readApprovedEdits(runner, appRoot)
  const source = sourceMigrations(appRoot)
  const { changed, missing } = checkAgainstMain({ main, base, source, approved })
  if (changed.length === 0 && missing.length === 0) {
    console.log(`All ${main.size} migrations on origin/main are unchanged.`)
    return { changed, missing }
  }
  const lines = []
  if (changed.length > 0) lines.push(`Changed after reaching origin/main: ${changed.join(', ')}.`)
  if (missing.length > 0) lines.push(`On origin/main but missing here: ${missing.join(', ')}.`)
  const entries = changed.length > 0 ? ` The entries to paste, if the owner approves the edits: ${pasteEntries(changed, source)} (the hash is of the file with LF line endings).` : ''
  throw new Error(`${lines.join(' ')} A migration on origin/main is never edited, renamed or removed (CLA-0010). Restore the file and fix forward with a new migration. If the owner approves the edit, they add '<entry> <what happened>. #<issue>' to approved-migration-edits.txt on main, and a rebase picks it up.${entries}`)
}
