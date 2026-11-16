import { runCli } from '../lib/cli.mjs'
import { tools } from './tools.mjs'

process.exitCode = await runCli('b', tools, process.argv.slice(2))
