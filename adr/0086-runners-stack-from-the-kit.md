# CLA-0086: One org-wide runner stack from the public kit, configured and guarded by the plugin

- **Status:** accepted
- **Date:** 2026-11-07
- **Area:** environments
- **Enforced by:** `tools/runners.mjs` and `tools/app-registry.mjs` with their tests, guardrail rules 3, 11 and 16 (CLA-0083), `hooks/stack-config-guard.mjs`, `hooks/session-start.mjs`, all in CI's `adrs` job
- **Issue:** #20

## Context

CLA-0033 says the CI runners are shared and refuse public repositories, but not how the stack is built, configured and kept safe. The public kit `lucem-labs/github-runner-dind` provides Docker-in-Docker sidecars and a supervisor, a Compose service that registers just-in-time runners and removes them on shutdown. Someone still has to pin it, give it a GitHub App credential, limit its runner group and enrol each app. Run by hand, each step is easy to get wrong in a way that shows up weeks later as jobs that queue silently, or as a private key in a repository.

## Decision

- **One runner stack per organization, from the public kit.** The supervisor registers runners in the organization's runner group, and apps carry only `runs-on: [self-hosted, linux, ci]`. Sharing runners between repositories needs an organization, and a free one is enough. A personal account gets one stack per repository instead, and `up` refuses a public repository there until the kit does (lucem-labs/github-runner-dind#20).
- **The plugin configures the stack and owns the wrapper.** `node tools/runners.mjs` reads one config folder per stack and runs `docker compose` itself. It adopts an existing folder by path and never edits the owner's own config repository. The runners skill gives the commands.
- **Every pin is in `runners.env`:** `RUNNERS_KIT_COMMIT` (40 hex) and `RUNNER_IMAGE` with `@sha256:`. Adopting or starting a folder refuses until both are there, and `up` checks out exactly that commit of the kit.
- **The config folder and the GitHub App key live outside any repository.** The tool checks that the key file exists, outside every git work tree, and never opens it. On Windows, neither may sit under `%LOCALAPPDATA%`, which Docker Desktop cannot see from the packaged desktop app.
- **The GitHub App comes from the manifest flow,** with one permission: organization self-hosted runners (administration on one repository, in per-repository mode). The tool writes the key straight to a file with mode 0600, and the key never appears in output or errors.
- **The runner group admits selected repositories and no public ones.** `up` refuses a group that allows public repositories or has visibility `all`.
- **`enroll <appRoot>` runs once per app.** It adds the repository to the runner group and allows Update branch, and refuses a repository that is not private.
- **The registry lists every stack,** and every stack's project is protected (CLA-0082, CLA-0083). The guardrail asks before the commands that create or open up the stack, and before writes into its config folder.
- **A session-start line reports the stack's health** and whether the app's repository is enrolled (CLA-0085).
- **There is no `down`.** Stopping the stack is the owner's: stop the supervisor first, then `docker compose down`, never with `-v`.

## Consequences

- A kit fix is one pin bump in `runners.env` and one `up`, not a change in every app.
- The pool is shared, so one app's CI queues behind another's. Workflows set `cancel-in-progress` so a superseded run frees its slot.
- The Docker socket is mounted into the supervisor only, which gives it control of the engine. Runner containers never get it.
- A repository that is not enrolled queues silently until GitHub cancels its jobs after 24 hours. The session-start line and `/claudalisk:runners enroll` exist to catch that.
- The plugin writes a GitHub App's key to disk. A leaked key is revoked in the App's settings.
