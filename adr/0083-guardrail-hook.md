# CLA-0083: One guardrail hook checks every shell command against the protected resources

- **Status:** accepted
- **Date:** 2026-11-05
- **Area:** environments
- **Enforced by:** `hooks/guardrail.mjs` and its tests, `hooks/shell.mjs` and its tests, `hooks/stack-config-guard.mjs` and its tests in CI's `adrs` job
- **Issue:** #2

## Context

Rejected: a hand-written `permissions.deny` list of command prefixes per app. Every command was listed once per shell and flag spelling, entries for a renamed environment stayed behind, and prefixes miss forms such as `docker compose --project-directory . -p <uat>`, `COMPOSE_PROJECT_NAME`, `gh api` on the merge endpoint and `pwsh -EncodedCommand`.

## Decision

- **One `PreToolUse` hook on `Bash|PowerShell` decides by tokens and protected names, not by prefix.** `hooks/shell.mjs` is the one parser, shared with the CI poll guard (CLA-0076). It splits sequences, strips quotes, follows `cd` and looks inside substitutions and nested shells. `hooks/README.md` describes how it reads a command and what it cannot see.
- **It applies to subagents too.** Every segment is checked. Deny beats ask beats allow.
- **The protected names are read at each call.** They are every registered app's uat Compose project, volume and protected volumes, the proxy's project and network, and the runners' projects (CLA-0082). The current app's `.claude/claudalisk.json` adds its own, and names derived from them are protected too: `<hostPrefix>.uat.localhost`, and the project name with `_` for `-`.
- **A broken registry or config denies only what needs the names.** A command that runs a container tool or a database client, or a Compose call, is denied with the file to fix. Other commands still go through the rules that need no names. An absent registry protects only the current app.
- **A crash asks,** and says the guardrail could not check the command. The hook always exits 0, because a non-zero exit would let the command run.
- **The rules:**

| # | Rule | Decision | ADR |
|---|------|----------|-----|
| 1 | Tokenizing: quotes, escapes, separators, assignments | n/a | CLA-0083 |
| 2 | Compose project from `-p`, `COMPOSE_PROJECT_NAME` and the `-f` set | deny | CLA-0029 |
| 3 | A container tool or database client naming a protected resource, or pointing into a registered runners config folder | deny | CLA-0029, CLA-0033, CLA-0086 |
| 4 | Guarded uat scripts: only deploy and backup run against uat; restore and init are the owner's | deny | CLA-0030, CLA-0031, CLA-0066 |
| 5 | Merging: `gh pr merge`, the merge API, pushes to the default branch | deny | CLA-0024 |
| 6 | `gh pr create` only when CI succeeded on the head commit | deny | CLA-0023 |
| 7 | Destructive verbs: `volume rm\|prune`, `system prune`, `down -v`, `rm -v` | deny | CLA-0029 |
| 8 | Shell writes of an env file with real values inside a checkout | deny | CLA-0066 |
| 9 | Opaque PowerShell: `-EncodedCommand`, `iex` | deny | CLA-0083 |
| 10 | `git add -f` of env, backup or dump files; setting `*ALLOW_UAT*` variables | ask | CLA-0026 |
| 11 | Changing a runner group's access, or registering a repository runner through the API | ask | CLA-0033 |
| 12 | A dangerous script's path anywhere in a PowerShell command | ask | CLA-0083 |
| 13 | `proxy.mjs recreate`, which stops every app's URLs for a moment | ask | CLA-0033 |
| 14 | `dotnet ef migrations remove`, also as `dotnet-ef` and `dotnet tool run dotnet-ef` | ask | CLA-0010 |
| 15 | A `deploy.mjs` command with `--adopt-unrecorded-migrations` | ask | CLA-0010 |
| 16 | `runners.mjs` `init`, `up`, `enroll`, `app create` or `group --apply`; a shell write into a registered runners config folder | ask | CLA-0033, CLA-0086 |

  - Every rule is a speed bump. In rule 3 the uat volume is also external, so Compose cannot remove it.
  - In rule 6, the hook checks CI. That dev was verified and the review was done stays prompt only.
  - Rule 16 also covers shell writes, and `hooks/stack-config-guard.mjs` asks the same for Edit, Write and MultiEdit (CLA-0086).
  - Commands in a config's `ownerOnlyCommands` are denied, and those in `askCommands` ask.
- **A hook sees only the top-level command.** A script that runs Compose inside itself guards itself (CLA-0030, CLA-0031).

## Consequences

- One parser and one rule table replace per-app deny lists, so a new bypass is fixed in one place, with a test.
- A broken registry stops container work until it is fixed, which is the intent.
- The hook is the only matcher. There is no generated `permissions.deny` backstop, so if the hook fails to start or a bug lets a command through, nothing else stops it. It stops a careless or mistaken command, not a determined one.
