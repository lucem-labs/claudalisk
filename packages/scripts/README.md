# @claudalisk/scripts

The scripts of a claudalisk app (CLA-0084): the guarded environment scripts and the scripts its CI runs, published to npm from lucem-labs/claudalisk by its release workflow.

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
| `scripts/check-migrations.mjs` | `@claudalisk/scripts/check-migrations` | Fails when a migration on `origin/main` is changed or missing on this branch, unless `approved-migration-edits.txt` on main covers its new content (CLA-0010). A branch is judged only on what it changed since its merge base with main |
| `scripts/no-comments.mjs` | `@claudalisk/scripts/no-comments` | `[<root>] [--skip <path>]...`: fails when a tracked file has a comment (CLA-0035) |
| `scripts/check-e2e-locators.mjs` | `@claudalisk/scripts/check-e2e-locators` | `[<folder>]`: fails on CSS and element locators in the end-to-end tests, `frontend/e2e` of the app by default (CLA-0070) |
| `scripts/install-security-tools.mjs` | `@claudalisk/scripts/install-security-tools` | `--tool <name>[,<name>]... [--destination <folder>]`: downloads gitleaks, OSV-Scanner, Trivy, zizmor or uv at a release pinned in the package and refuses a download whose SHA-256 differs (CLA-0071) |
| `scripts/scan-images.mjs` | `@claudalisk/scripts/scan-images` | `[--build] [--scan] --image <name>=<Dockerfile>...`: builds the images and scans each with Trivy from a `docker save` archive (CLA-0071) |
| `scripts/zap-baseline.mjs` | `@claudalisk/scripts/zap-baseline` | `--target http://<app>.dev.localhost [--proxy-host <IPv4 address>]`: the ZAP baseline against dev with `.zap/rules.tsv` (CLA-0071) |
| `scripts/trx-annotations.mjs` | `@claudalisk/scripts/trx-annotations` | `<TRX results folder>`: turns the failing tests of .NET TRX reports into annotations and a job summary (CLA-0076) |
| `scripts/base-status.mjs` | `@claudalisk/scripts/base-status` | `[--open-pulls]`: sets the commit status `up to date with main` on `GITHUB_SHA` from GitHub's compare API with Node's `fetch` (no `gh`), and exits 1 when the commit is behind. `--open-pulls` sets it on the head of every open pull request into `main` and exits 0 whatever they show, non-zero on an API error (CLA-0034) |
| `scripts/free-ports.mjs` | `@claudalisk/scripts/free-ports` | `NAME...`: finds a free local port for each name and appends `NAME=port` to the `GITHUB_ENV` file, or prints the lines when it is unset. Refuses a name that is not a valid variable name (CLA-0018) |
| `scripts/check-forbidden-files.mjs` | `@claudalisk/scripts/check-forbidden-files` | Fails when a tracked file, or a file added by any commit of `origin/main..HEAD`, is an env file other than `*.example`, a dump or backup (`*.dump`, `*.pgdump`, `*.backup`, `*.bak`, `*.sql.gz`, anything under `backups/`) or a `*.local.json` file (CLA-0026) |
| `scripts/check-source-hygiene.mjs` | `@claudalisk/scripts/check-source-hygiene` | `[--skip <path>]...`: fails on a byte order mark that is not the first character, zero-width characters and bidirectional controls in tracked text files. Binary files and `fixtures` folders are skipped (CLA-0071) |
| `scripts/check-suppressions.mjs` | `@claudalisk/scripts/check-suppressions` | Fails when a `[SuppressMessage]` in a tracked `.cs` file has no `Justification` ending `Until yyyy-MM-dd.`, or when that date, `ignoreUntil` in `osv-scanner.toml` or `expired_at` in `.trivyignore.yaml` is missing, past or more than 90 days away (CLA-0071) |

`@claudalisk/scripts/fake-runner` is the injectable command runner the library's own tests use, for an app's tests of its entries.

The environment commands refuse to run when `CI` or `GITHUB_ACTIONS` is set. check-migrations and the CI-run scripts (no-comments, check-e2e-locators, install-security-tools, scan-images, zap-baseline, trx-annotations, base-status, free-ports, check-forbidden-files, check-source-hygiene, check-suppressions) run in CI.

## Conventions

The values that differ between apps come from `.claude/claudalisk.json` (CLA-0082). The rest is fixed: `compose.base.yml` and `compose.<env>.yml`, the services `api` and `db`, the Compose profile `migrate`, the environments `dev` and `uat`, the `traefik` project and network, `origin/main`, the workflow `ci.yml`, the table `__EFMigrationsHistory`, and state in `~/.claudalisk/apps/<name>/`.

- Env files: `.env.<env>.example` in the checkout is the template for `<env>.env`. `POSTGRES_USER` and `POSTGRES_PASSWORD` configure the `db` service. The placeholder `CHANGE_ME` is replaced by the generated password, and for dev `DEV_POSTGRES_PORT` is set from `ports.devDb`.
- Databases: each entry of `databases` names the variable that holds its connection string. The database name is its `Database=` part. An app with one database may leave the variable out of the env file and set `POSTGRES_DB`.
- Deployed commit: the API image sets `DEPLOYED_SHA` and `DEPLOYED_REF` in its environment. A backup reads them from the `api` container, running or not, or from the image `<compose project>-api`.
- `migrate` runs the single `backend/<Name>.Api/<Name>.Api.csproj`, or the one `--project` names, with each database's connection variable pointing at the dev database.
- `approved-migration-edits.txt` in the app root, read from `origin/main` only, has one line per approved edit: `<schema>/<migration id> <sha256 of the file with LF endings> <what happened>. #<issue>`. An entry approves that one content of that migration.
- `deploy.mjs --environment uat --adopt-unrecorded-migrations`: the owner records the fingerprints of migrations uat applied that are neither recorded nor on `origin/main`.
