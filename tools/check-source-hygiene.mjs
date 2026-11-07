import { runMain } from '../packages/scripts/src/cli.mjs'
import { checkSourceHygiene } from '../packages/scripts/src/commands/check-source-hygiene.mjs'

runMain(checkSourceHygiene)
