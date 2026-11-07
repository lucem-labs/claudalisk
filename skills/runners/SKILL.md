---
name: runners
description: Sets up, adopts, checks and enrols apps on the shared self-hosted CI runners built from the public github-runner-dind kit (CLA-0086). Use when CI jobs queue, when setting up runners on a machine, when a new app needs the runners, or when the session-start line says no runner stack serves the repository.
argument-hint: "status | init | app create | group [--apply] | up | adopt <dir> | enroll <appRoot> | logs"
user-invocable: true
---

# Runners

One runner stack per organization serves every private app in it (CLA-0033, CLA-0086). The plugin owns the wrapper, `tools/runners.mjs`, and reads one config folder per stack. Run it only through:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/runners.mjs" <command>
```

## Why an organization

Self-hosted runners on a personal account attach to one repository each. To share one pool between repositories you need an organization, and a free one is enough: its runner group can be limited to selected repositories.

## Set-up order

1. `init (--org <org> | --repo <owner/repo>) --kit-commit <sha> --image <ref@sha256:...>` writes `runners.env` in `~/.claudalisk/runners/<project>/` and refuses an existing one. It refuses a user account for `--org` and a public repository for `--repo`. It prints the next steps.
2. `app create --config <dir>` starts a one-shot page on 127.0.0.1. Open the printed address while signed in to GitHub as an owner and approve the App. The tool saves the key to `~/.config/claudalisk-runners/<slug>.pem` and prints only the App id, slug, key path and install URL. It never prints the key.
3. Install the App from the printed URL, on the organization (or only on the repository, in repository mode).
4. `group --config <dir>` shows the runner group. `--apply` sets visibility to selected and turns public repositories off. If the group's visibility is `all`, it refuses until some repositories are selected, because the switch cuts off every other repository.
5. `up --config <dir>` fetches the pinned kit into `.kit/<commit12>`, runs `docker compose` with the kit's `compose.yaml`, then each `compose.*.yaml` of the folder (a stack with more slots adds one), and registers the stack. It refuses on any config problem, on a group that allows public repositories or has visibility `all`, and on a kit that is not at the pinned commit or is modified.

Every pin lives in `runners.env`: `RUNNERS_KIT_COMMIT` and `RUNNER_IMAGE@sha256:`. A kit fix is a pin bump and one `up`.

## Adopting an existing folder

`adopt <dir>` validates the folder fully and writes nothing on any problem, listing each one. A folder without `RUNNERS_KIT_COMMIT` is refused until you add `RUNNERS_KIT_COMMIT=<commit>` to its `runners.env`. If containers of the project already run, it says it adopts them. It registers the stack and starts nothing. The owner retires an old wrapper by hand.

## Per app

`enroll <appRoot>` finds the registered stack that serves the app's repository and refuses a repository that is not private. It adds the repository to the runner group and allows Update branch, and says "already" for each step that was done. Until a repository is enrolled, its self-hosted jobs queue silently and GitHub cancels them after 24 hours.

## Personal accounts

Use `--repo`: one stack per repository, its own App with the administration permission. The kit does not yet refuse a public repository itself (lucem-labs/github-runner-dind#20), so `init` and `up` do.

## Health

- `status [--config <dir> | --project <name>]` reads only. It shows the project's containers and whether the supervisor runs, the runners with status, busy and labels, the runner group with its visibility and selected repositories, and any config problems as warnings. It works on a folder that is not registered.
- `logs [--project <name>]` prints the last 100 lines of the supervisor.
- At session start, one line gives the stack's state, the runners online and whether the repository is in the group.

## Guardrail

The guardrail asks before `init`, `up`, `enroll`, `app create` and `group --apply`, and before a non-GET API call that changes a runner group or registers a runner. It denies a Docker command that points into a registered config folder, and asks before an Edit or Write there. `status`, `adopt`, `logs` and `group` without `--apply` pass.

## Good to know

- The pool is shared, so one app's CI queues behind another's. Workflows set `cancel-in-progress`.
- The Docker socket is mounted into the supervisor only. Runner containers never get it.
- Packaged desktop app trap on Windows: files created under `%LOCALAPPDATA%` go to a redirected private copy that Docker Desktop cannot see. The tool refuses a config folder or key there.
- On Windows the 0600 mode of the key file has no effect, so keep the key under the user profile (the default is `~/.config/claudalisk-runners`), never in a shared folder.
- The key stays outside any git work tree. The tool checks that the file exists and never opens it.

## Stopping

There is no `down`. The owner stops the stack by hand:

```
docker compose -p <project> stop supervisor
docker compose -p <project> down
```

Never with `-v`.
