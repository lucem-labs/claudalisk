# CLA-0086: One org-wide runner stack from the public kit, configured and guarded by the plugin

- **Status:** accepted
- **Date:** 2026-11-07
- **Area:** environments
- **Enforced by:** `tools/runners.mjs` and `tools/app-registry.mjs` with their tests, guardrail rules 3, 11 and 16 (CLA-0083), `hooks/stack-config-guard.mjs`, `hooks/session-start.mjs`, all in CI's `adrs` job
- **Issue:** #20

## Context

CLA-0033 says the CI runners are shared and refuse public repositories, but not how the stack is built, configured and kept safe. The public kit `lucem-labs/github-runner-dind` provides the Docker-in-Docker sidecars and a supervisor, a Compose service that registers just-in-time runners and removes them on shutdown. Someone still has to pin it, give it a GitHub App credential, limit its runner group, and enrol each app. Run by hand, each of those steps is easy to get wrong in a way that shows up weeks later as jobs that queue silently, or as a private key in a repository.

## Decision

- **One runner stack per organization, from the public kit.** The supervisor registers runners in the organization's runner group, and apps carry only `runs-on: [self-hosted, linux, ci]` (CLA-0033). Sharing runners between repositories needs an organization; a free one is enough.
- **The plugin configures it and owns the wrapper.** `node tools/runners.mjs` reads one config folder per stack and runs `docker compose` itself. It adopts an existing folder by path and never edits the owner's own config repository.
- **Every pin is in `runners.env`:** `RUNNERS_KIT_COMMIT` (40 hex) and `RUNNER_IMAGE` with `@sha256:`. Adopting a folder or starting it refuses until both are there. `up` fetches the kit to `.kit/<first 12 of the commit>`, checks out the commit, verifies `HEAD` and refuses a dirty tree.
- **The config folder and the key live outside any repository.** The folder defaults to `~/.claudalisk/runners/<project>/`. `GITHUB_APP_KEY_FILE` must exist, sit outside every git work tree, and, on Windows, neither it nor the folder may sit under `%LOCALAPPDATA%`, which the packaged desktop app redirects and Docker Desktop cannot see. The tool checks that the key file exists and never opens it.
- **The GitHub App comes from the manifest flow.** `app create` serves a one-shot page on 127.0.0.1, the owner approves the App in GitHub, and the tool converts the code, writes the key straight to `~/.config/claudalisk-runners/<slug>.pem` with mode 0600, and prints only the App id, slug, key path and install URL. The key never appears in output or errors. The App has one permission: organization self-hosted runners (administration on one repository, in per-repository mode).
- **The runner group admits selected repositories and no public ones.** `group --apply` sets that. `up` refuses a group that allows public repositories or has visibility `all`, and `group --apply` refuses to leave `all` while no repository is selected, because the switch cuts off every repository that is not yet selected.
- **`enroll <appRoot>` runs once per app:** it adds the repository to the runner group and allows Update branch, and says "already" for each step that was done. It refuses a repository that is not private.
- **Per-repository mode is for personal accounts.** One stack per repository, registered with the repository as its target. `up` refuses a public repository until the kit does (lucem-labs/github-runner-dind#20).
- **The registry lists every stack** as `runners: [{composeProject, configDir, scope, target, groupId?}]`, upserted by Compose project (CLA-0082). Every project is protected (CLA-0083).
- **A session-start line reports health** (CLA-0085): the stack's state and supervisor, runners online and busy, and whether the app's repository is in the runner group, with `unknown` for any part a call could not answer. It says that no stack serves the repository when none does.
- **The guardrail guards the stack** (CLA-0083):
  - rule 16 asks before `runners.mjs` `init`, `up`, `enroll`, `app create` or `group --apply`;
  - rule 3 denies a container command that points into a registered config folder, which would bypass the project-name check;
  - rule 11 also asks on a non-GET `repos/*/*/actions/runners` call;
  - an Edit, Write or MultiEdit into a registered config folder asks (`hooks/stack-config-guard.mjs`).
- **There is no `down`.** Stopping the stack is the owner's: `docker compose -p <project> stop supervisor`, then `docker compose -p <project> down`, never with `-v`.

## Consequences

- A kit fix is one pin bump in `runners.env` and one `up`, not a change in every app.
- The pool is shared, so one app's CI queues behind another's. Workflows set `cancel-in-progress` so a superseded run frees its slot.
- The Docker socket is mounted into the supervisor only. That gives it control of the engine, as any host-side supervisor has. Runner containers never get it.
- A repository that is not enrolled queues silently until GitHub cancels its jobs after 24 hours. The session-start line and `/claudalisk:runners enroll` exist to catch that.
- The plugin writes a GitHub App's key to disk, which is why the flow, its tests and the rules above exist. A leaked key is revoked in the App's settings.
