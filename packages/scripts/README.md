# @claudalisk/scripts

The guarded environment scripts of a claudalisk app (CLA-0084), published to npm from lucem-labs/claudalisk by its release workflow.

An app depends on an exact version, so a deploy is reproducible from its commit and a safety fix reaches the app as a version bump:

```
npm install --save-dev --save-exact @claudalisk/scripts
```

Each command is a function that takes `{ appRoot, argv, env, runner }`. The app keeps a thin entry script for it at a stable path, copied from `templates/app/scripts/` in claudalisk:

```js
import { runMain } from '@claudalisk/scripts/cli'
import { deploy } from '@claudalisk/scripts/deploy'

runMain(deploy)
```

| Entry | Export | What it does |
|---|---|---|
| `scripts/deploy.mjs` | `@claudalisk/scripts/deploy` | `--environment dev\|uat [--confirm 'deploy uat <sha7>']`: the guarded deploy (CLA-0030) |
| `scripts/backup.mjs` | `@claudalisk/scripts/backup` | `[--reason <text>]`: a uat backup (CLA-0031) |
| `scripts/restore.mjs` | `@claudalisk/scripts/restore` | `--environment dev\|uat --backup <name\|latest> [--owner-approved --confirm '...'] [--no-start]` |
| `scripts/prune-backups.mjs` | `@claudalisk/scripts/prune-backups` | `[--keep <n>] [--apply]`: dry run unless `--apply` |
| `scripts/refresh-dev.mjs` | `@claudalisk/scripts/refresh-dev` | `[--backup <name\|latest>] [--fresh]` (CLA-0032) |
| `scripts/init.mjs` | `@claudalisk/scripts/init` | `--environment dev\|uat`: env file and volume (CLA-0066) |
| `scripts/migrate.mjs` | `@claudalisk/scripts/migrate` | `[--project <csproj>]`: migrates the dev databases from a directly launched Host (CLA-0008) |

`@claudalisk/scripts/fake-runner` is the injectable command runner the library's own tests use, for an app's tests of its entries.

Every command refuses to run when `CI` or `GITHUB_ACTIONS` is set.

## Conventions

The values that differ between apps come from `.claude/claudalisk.json` (CLA-0082). The rest is fixed: `compose.base.yml` and `compose.<env>.yml`, the services `api` and `db`, the Compose profile `migrate`, the environments `dev` and `uat`, the `traefik` project and network with `compose.proxy.yml`, `origin/main`, the workflow `ci.yml`, the table `__EFMigrationsHistory`, and state in `~/.claudalisk/apps/<name>/`.

- Env files: `.env.<env>.example` in the checkout is the template for `<env>.env`. `POSTGRES_USER` and `POSTGRES_PASSWORD` configure the `db` service. The placeholder `CHANGE_ME` is replaced by the generated password, and for dev `DEV_POSTGRES_PORT` is set from `ports.devDb`.
- Databases: each entry of `databases` names the variable that holds its connection string. The database name is its `Database=` part. An app with one database may leave the variable out of the env file and set `POSTGRES_DB`.
- Deployed commit: the API image sets `DEPLOYED_SHA` and `DEPLOYED_REF` in its environment. A backup reads them from the `api` container, running or not, or from the image `<compose project>-api`.
- `migrate` runs the single `backend/<Name>.Api/<Name>.Api.csproj`, or the one `--project` names, with each database's connection variable pointing at the dev database.
- `approved-migration-edits.txt` in the app root lists the migrations a uat deploy may accept as edited.
