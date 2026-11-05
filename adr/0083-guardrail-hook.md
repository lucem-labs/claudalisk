# CLA-0083: One guardrail hook checks every shell command against the protected resources

- **Status:** accepted
- **Date:** 2026-11-05
- **Area:** environments
- **Enforced by:** `hooks/guardrail.mjs` and its tests, `hooks/shell.mjs` and its tests in CI's `adrs` job
- **Issue:** #2

## Context

Apps protected uat with a hand-written `permissions.deny` list of command prefixes. Every command was listed twice, once per shell and once per flag spelling, and entries for a renamed environment stayed behind. Prefixes miss `docker compose --project-directory . -p <uat>`, `COMPOSE_PROJECT_NAME`, `docker-compose`, `gh api` on the merge endpoint and `pwsh -EncodedCommand`. `docker compose down -v` was not listed at all. Some rules existed only as prose in `AGENTS.md`.

## Decision

- **One `PreToolUse` hook on `Bash|PowerShell` decides by tokens and protected names, not by prefix.** `hooks/shell.mjs` is the one parser, shared with the scout gate (CLA-0080). It splits a command on `;`, `&&`, `||`, `|`, `&` and newlines, strips quotes and escapes for the shell in use, keeps leading `VAR=value` assignments and finds the text inside `$(...)`, backticks, `bash -c` and `pwsh -Command`. Heredoc bodies stay data, so a commit message that mentions `gh pr merge` is allowed.
- **It applies to subagents too.** Every segment is checked, and the hook recurses up to five levels into shells, `eval` and substitutions. Past that it asks. Deny beats ask beats allow.
- **The protected names are read at each call.** They are every registered app's uat Compose project, volume and protected volumes, the proxy's project and network, the runners' project (CLA-0082), the same from the current app's `.claude/claudalisk.json`, and names derived from them: `<hostPrefix>.uat.localhost` and the project name with `_` for `-`. A token names a resource when the name appears with no `[a-z0-9_-]` before it and no `[a-z0-9]` after it.
- **A broken registry or config denies only what needs the names.** A command that runs a container tool or a database client, or a Compose call, is denied with the file to fix. Other commands still go through the rules that need no names, so `git status` is allowed.
- **The hook follows `cd`.** `cd`, `pushd`, `Set-Location` and the like change the directory that later commands in a sequence (`;`, `&&`, a newline) are judged in. A Git Bash path such as `/c/repo` is read as a Windows path on Windows. When the hook cannot tell the directory, after `cd -`, `popd` or a target built from a variable, a command that depends on it is denied: a push with no explicit refspec, `gh pr create`, a relative env file write, and a uat script. A later `cd` to a known absolute path clears it. A `cd` that ends in `||`, and a piped `cd` in PowerShell, leave the directory unknown too. A line continuation inside a word asks, because it can hide a command.
- **An absent registry protects only the current app,** since a machine with no registered app has nothing else to protect (CLA-0082). A corrupt config loses its command lists, while a corrupt registry with a good config keeps them.
- **A registry carries no uat database name,** so databases are matched by the derived names: the project name with `_` for `-`.
- **A crash asks.** An unreadable input or any other error gives an `ask` that says the guardrail could not check the command. The hook always exits 0, because a non-zero exit would let the command run.
- **The rules and how each is enforced:**

| # | Rule | Decision | ADR | Enforced by |
|---|------|----------|-----|-------------|
| 1 | Tokenizing: quotes, escapes, separators, assignments | n/a | CLA-0083 | hook speed bump |
| 2 | Compose project from `-p`, `COMPOSE_PROJECT_NAME` and the `-f` set | deny | CLA-0029 | hook speed bump |
| 3 | A container tool or database client naming a protected resource | deny | CLA-0029, CLA-0033 | hook speed bump, structural |
| 4 | Guarded uat scripts: only deploy and backup run against uat; restore, init and `prune-backups --apply` are the owner's | deny | CLA-0030, CLA-0031, CLA-0066 | guarded by the script, hook speed bump |
| 5 | Merging: `gh pr merge`, the merge API, pushes to the default branch | deny | CLA-0024 | hook speed bump |
| 6 | `gh pr create` only when CI succeeded on the head commit | deny | CLA-0023 | hook speed bump, prompt only |
| 7 | Destructive verbs: `volume rm\|prune`, `system prune`, `down -v`, `rm -v` | deny | CLA-0029 | hook speed bump, structural |
| 8 | Shell writes of an env file with real values inside a checkout | deny | CLA-0066 | hook speed bump, CI/test |
| 9 | Opaque PowerShell: `-EncodedCommand`, `iex` | deny | CLA-0083 | hook speed bump |
| 10 | `git add -f` of env, backup or dump files; setting `*ALLOW_UAT*` variables | ask | CLA-0026 | hook speed bump, CI/test |
| 11 | Changing a runner group's access | ask | CLA-0033 | hook speed bump |
| 12 | A dangerous script's path (in a `scripts` directory, or relative with `./` or `../`) anywhere in a PowerShell command | ask | CLA-0083 | hook speed bump |

  - In rule 6, the hook checks CI. That dev was verified and that the review was done stay with the workflow, as prompt only.
  - In rule 3, the uat volume is external, so Compose cannot remove it, which is the structural part.
  - Commands in a config's `ownerOnlyCommands` are denied and those in `askCommands` ask.
- **A hook sees only the top-level command.** A script that runs Compose inside itself guards itself (CLA-0030, CLA-0031).
- **Known limits:** a command assembled at run time from variables, text piped into a shell, here-strings (`bash <<< "..."`), wrappers it does not know such as `timeout`, the contents of a script file, and `gh api` updating a ref directly. Shell writes and removals under `~/.claudalisk/apps/<app>/`, such as `rm -rf` of backups or a hand-written `uat.env`, are not checked. A container addressed by id is not matched to its project. The Compose project is not known when it comes from a `.env` file or the folder name. A connection string that lives only in the hook's environment is not seen. PowerShell assignment to a member or index (`$x.y =`, `$x[0] =`) and `*=` is not followed. An `eval` of a `cd` is not followed. Git Bash mount paths other than drive letters, such as `/tmp`, are not translated. A `)` inside a quoted string within `$((` is not handled. A command behind a spaced leading redirect such as `>& x cmd` or `<< EOF cmd` is not seen. The hook stops a careless or mistaken command. A determined one can get past it, for example through a script file. The external uat volume does not depend on the hook: Compose cannot remove it.

## Consequences

- One parser and one rule table replace per-app deny lists. A rename changes the config, not the hook.
- A new bypass is fixed in one place, with a test.
- A broken registry stops container work until it is fixed, which is the intent.
- No generated `permissions.deny` backstop exists yet, so the hook is the only matcher.
- Rule 12 asks for a command that only mentions a script path in PowerShell, because PowerShell would run it.
- A line that ends in a backslash with no space before it, inside an unquoted heredoc or `$((`, asks even when it is harmless. A quoted delimiter such as `<<'EOF'` avoids that.
