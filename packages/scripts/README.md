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
| `scripts/deploy.mjs` | `@claudalisk/scripts/deploy` | `--environment dev\|uat [--confirm 'deploy uat <sha7>'] [--recreate-dev-volume]`: the guarded deploy (CLA-0030). `--recreate-dev-volume` lets a dev deploy remove a dev volume that has no `dev.env`. A deploy that ends healthy keeps the images it built and the ones it replaced, and removes the environment's older images |
| `scripts/backup.mjs` | `@claudalisk/scripts/backup` | `[--reason <text>]`: a uat backup (CLA-0031). It then deletes every uat backup but itself, the one before it and the restore points pruning keeps |
| `scripts/restore.mjs` | `@claudalisk/scripts/restore` | `--environment dev\|uat --backup <name\|latest> [--owner-approved --confirm '...'] [--no-start]` |
| `scripts/refresh-dev.mjs` | `@claudalisk/scripts/refresh-dev` | `[--backup <name\|latest>] [--fresh]` (CLA-0032) |
| `scripts/init.mjs` | `@claudalisk/scripts/init` | `--environment dev\|uat [--adopt-volume [--password <password>]]`: env file and volume (CLA-0066). `--adopt-volume` writes `dev.env` for an existing dev volume and checks that the password connects |
| `scripts/migrate.mjs` | `@claudalisk/scripts/migrate` | `[--project <csproj>]`: migrates the dev databases from a directly launched Host (CLA-0008) |
| `scripts/check-migrations.mjs` | `@claudalisk/scripts/check-migrations` | Fails when a migration on `origin/main` is changed or missing on this branch, unless `approved-migration-edits.txt` on main covers its new content (CLA-0010). A branch is judged only on what it changed since its merge base with main |
| `scripts/check-version.mjs` | `@claudalisk/scripts/check-version` | Fails when the root `package.json` has no Semantic Versioning `version`, or when it is not higher than the one on `origin/main` (CLA-0099). A commit that is already on `origin/main` passes |
| `scripts/no-comments.mjs` | `@claudalisk/scripts/no-comments` | `[<root>] [--skip <path>]...`: fails when a tracked file has a comment (CLA-0035) |
| `scripts/check-e2e-locators.mjs` | `@claudalisk/scripts/check-e2e-locators` | `[<folder>]`: fails on CSS and element locators in the end-to-end tests, `frontend/e2e` of the app by default (CLA-0070) |
| `scripts/install-security-tools.mjs` | `@claudalisk/scripts/install-security-tools` | `--tool <name>[,<name>]... [--destination <folder>]`: downloads gitleaks, OSV-Scanner, Trivy, zizmor or uv at a release pinned in the package and refuses a download whose SHA-256 differs (CLA-0071) |
| `scripts/scan-images.mjs` | `@claudalisk/scripts/scan-images` | `[--build] [--scan] --image <name>=<Dockerfile>...`: builds the images and scans each with Trivy from a `docker save` archive (CLA-0071) |
| `scripts/zap-baseline.mjs` | `@claudalisk/scripts/zap-baseline` | `--target http://<app>.dev.localhost [--proxy-host <IPv4 address>]`: the ZAP baseline against dev with `.zap/rules.tsv` (CLA-0071). Without `--proxy-host` it attaches ZAP to the machine-wide proxy's network from `~/.claudalisk/apps.json` (`traefik` when the registry names none) and maps dev to the proxy container's address there, and falls back to `host.docker.internal` when no proxy container runs |
| `scripts/trx-annotations.mjs` | `@claudalisk/scripts/trx-annotations` | `<TRX results folder>`: turns the failing tests of .NET TRX reports into annotations and a job summary (CLA-0076) |
| `scripts/base-status.mjs` | `@claudalisk/scripts/base-status` | `[--open-pulls]`: sets the commit status `up to date with main` on `GITHUB_SHA` from GitHub's compare API with Node's `fetch` (no `gh`), and exits 1 when the commit is behind. `--open-pulls` sets it on the head of every open pull request into `main` and exits 0 whatever they show, non-zero on an API error (CLA-0034) |
| `scripts/free-ports.mjs` | `@claudalisk/scripts/free-ports` | `NAME...`: finds a free local port for each name and appends `NAME=port` to the `GITHUB_ENV` file, or prints the lines when it is unset. Refuses a name that is not a valid variable name (CLA-0018) |
| `scripts/check-forbidden-files.mjs` | `@claudalisk/scripts/check-forbidden-files` | Fails when a tracked file, or a file added by any commit of `origin/main..HEAD`, is an env file other than `*.example`, a dump or backup (`*.dump`, `*.pgdump`, `*.backup`, `*.bak`, `*.sql.gz`, anything under `backups/`) or a `*.local.json` file (CLA-0026) |
| `scripts/check-source-hygiene.mjs` | `@claudalisk/scripts/check-source-hygiene` | `[--skip <path>]...`: fails on a byte order mark that is not the first character, zero-width characters and bidirectional controls in tracked text files. Binary files and `fixtures` folders are skipped (CLA-0071) |
| `scripts/check-suppressions.mjs` | `@claudalisk/scripts/check-suppressions` | Fails when a `[SuppressMessage]` in a tracked `.cs` file has no `Justification` ending `Until yyyy-MM-dd.`, or when that date, `ignoreUntil` in `osv-scanner.toml` or `expired_at` in `.trivyignore.yaml` is missing, past or more than 90 days away (CLA-0071) |

`@claudalisk/scripts/fake-runner` is the injectable command runner the library's own tests use, for an app's tests of its entries.

The environment commands refuse to run when `CI` or `GITHUB_ACTIONS` is set. check-migrations, check-version and the CI-run scripts (no-comments, check-e2e-locators, install-security-tools, scan-images, zap-baseline, trx-annotations, base-status, free-ports, check-forbidden-files, check-source-hygiene, check-suppressions) run in CI.

## Conventions

The values that differ between apps come from `.claude/claudalisk.json` (CLA-0082). The rest is fixed: `compose.base.yml` and `compose.<env>.yml`, the services `api` and `db`, the Compose profile `migrate`, the environments `dev` and `uat`, the `traefik` project and network, `origin/main`, the workflow `ci.yml`, the table `__EFMigrationsHistory`, and state in `~/.claudalisk/apps/<name>/`.

- Env files: `.env.<env>.example` in the checkout is the template for `<env>.env`. `POSTGRES_USER` and `POSTGRES_PASSWORD` configure the `db` service. The placeholder `CHANGE_ME` is replaced by the generated password, and for dev `DEV_POSTGRES_PORT` is set from `ports.devDb`.
- Volumes: the uat database volume is `uat.volume`. The dev one is `<name>-dev_postgres-data`, the name Compose gives the `postgres-data` volume of the project `<name>-dev`. An app whose `compose.dev.yml` names it otherwise sets `dev.volume` to that name, so init and `--recreate-dev-volume` check and remove the volume dev runs on. It cannot be a volume that holds uat data.
- Databases: each entry of `databases` names the variable that holds its connection string. The database name is its `Database=` part. An app with one database may leave the variable out of the env file and set `POSTGRES_DB`.
- Deployed commit: the API image sets `DEPLOYED_SHA` and `DEPLOYED_REF` in its environment. A backup reads them from the `api` container, running or not, or from the image `<compose project>-api`.
- App version: the `version` of the root `package.json` (CLA-0099). A deploy passes it to the containers as `DEPLOYED_VERSION`, which `compose.base.yml` forwards like `DEPLOYED_SHA`, and tags the images it built with it. A backup reads it from the `api` container into `deployedVersion` of its manifest. An app without a version deploys as before.
- Images: Compose names a built image `<compose project>-<service>`, and a service with a `build` key keeps that name. A deploy refuses, before it changes anything, a Compose file that sets `image:` to another name on such a service, as in `image: shop:${DEPLOYED_SHA}`: the previous image is found through the moving `latest` tag of the default name, and a per-commit tag has none. The deploy tags what it built with the app's version instead. A pulled image, such as the one of `db`, may have any name. A deploy tags the image each service runs as `<compose project>-<service>:replaced` before it builds. An image store may drop an image as soon as a build takes its tag, so the hold comes first. Once the deploy ends healthy, that tag becomes `<compose project>-<service>:previous` when the build changed the image's layers, and is dropped when it did not, so a service that did not change keeps its real previous image. Layers are compared, not ids, because an image store may give a fully cached rebuild a new id. A Dockerfile that declares `ARG DEPLOYED_SHA` before its build steps changes their layers on every commit, so declare it after them. The project's untagged images are then removed by their `com.docker.compose.project` label. A failed deploy leaves the `replaced` tag for the next one. Volumes and the build cache are left alone.
- Backups: `backups/` holds the current and the previous uat backup, plus the newest one from before each migration uat has applied and `origin/main` lacks. Each backup deletes the rest once its manifest is written. A folder without a manifest is left alone.
- `migrate` runs the single `backend/<Name>.Api/<Name>.Api.csproj`, or the one `--project` names, with each database's connection variable pointing at the dev database.
- `approved-migration-edits.txt` in the app root, read from `origin/main` only, has one line per approved edit: `<schema>/<migration id> <sha256 of the file with LF endings> <what happened>. #<issue>`. An entry approves that one content of that migration.
- `deploy.mjs --environment uat --adopt-unrecorded-migrations`: the owner records the fingerprints of migrations uat applied that are neither recorded nor on `origin/main`.
- Migration fingerprints: the uat deploy records a SHA-256 of each migration uat has applied, from its source file with LF line endings, right after the migrations run, even when a later step fails. A deploy is refused when an applied migration's file no longer matches its fingerprint, unless an `approved-migration-edits.txt` entry covers the new content. An applied migration with no fingerprint takes its baseline from `origin/main` when its file is there, and the deploy is refused when the commit's file differs. When it is not on main, the deploy is refused unless the owner passes `--adopt-unrecorded-migrations`. The deploy refuses when `git fetch origin main` fails, so it never judges against a stale main.
- check-migrations needs `origin/main` and enough history for `git merge-base origin/main HEAD`. Without them, every migration on main must equal main's copy. Its message names each changed migration with the entry to paste.
