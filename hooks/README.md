# Hooks

The plugin's hooks, registered in `hooks.json`. Each has tests beside it, and CI's `adrs` job runs them.

| Hook | Event | ADR |
|---|---|---|
| `guardrail.mjs` | `PreToolUse` on `Bash\|PowerShell` | CLA-0083 |
| `ci-poll-guard.mjs` | `PreToolUse` on `Bash\|PowerShell` | CLA-0076 |
| `migration-guard.mjs` | `PreToolUse` on `Edit\|Write\|MultiEdit` | CLA-0010 |
| `stack-config-guard.mjs` | `PreToolUse` on `Edit\|Write\|MultiEdit` | CLA-0086 |
| `session-start.mjs` | `SessionStart` | CLA-0085 |

`shell.mjs` is the one shell parser that the guardrail and the CI poll guard share.

## How the guardrail reads a command

- It splits a command on `;`, `&&`, `||`, `|`, `&` and newlines, and strips quotes and escapes for the shell in use.
- It keeps leading `VAR=value` assignments.
- It finds the text inside `$(...)`, backticks, `bash -c` and `pwsh -Command`, and recurses up to five levels into shells, `eval` and substitutions. Past that it asks.
- Heredoc bodies stay data, so a commit message that mentions `gh pr merge` is allowed.
- A token names a protected resource when the name appears with no `[a-z0-9_-]` before it and no `[a-z0-9]` after it.
- A registry carries no uat database name, so databases are matched by the project name with `_` for `-`.
- **It follows `cd`.**
  - `cd`, `pushd`, `Set-Location` and the like change the directory that later commands in a sequence are judged in. A Git Bash path such as `/c/repo` is read as a Windows path on Windows.
  - After `cd -`, `popd` or a target built from a variable, the directory is unknown. A command that depends on it is then denied: a push with no explicit refspec, `gh pr create`, a relative env file write, or a uat script. A later `cd` to a known absolute path clears it.
  - A `cd` that ends in `||`, and a piped `cd` in PowerShell, leave the directory unknown.
- A line continuation inside a word asks, because it can hide a command. A line that ends in a backslash with no space before it, inside an unquoted heredoc or `$((`, asks even when it is harmless. A quoted delimiter such as `<<'EOF'` avoids that.
- Rule 12 asks for a command that only mentions a script path in PowerShell, because PowerShell would run it.
- Rule 15, for `--adopt-unrecorded-migrations`, matches only a command or argument named `deploy` or `deploy.mjs`.

## What the guardrail does not see

- a command assembled at run time from variables, text piped into a shell, here-strings (`bash <<< "..."`), and the contents of a script file;
- wrappers it does not know, such as `timeout`;
- `gh api` updating a ref directly;
- shell writes and removals under `~/.claudalisk/apps/<app>/`, such as `rm -rf` of backups or a hand-written `uat.env`;
- a container addressed by id, which is not matched to its project;
- a Compose project that comes from a `.env` file or the folder name;
- a connection string that lives only in the hook's environment;
- PowerShell assignment to a member or index (`$x.y =`, `$x[0] =`), `*=`, and an `eval` of a `cd`;
- Git Bash mount paths other than drive letters, such as `/tmp`;
- a `)` inside a quoted string within `$((`;
- a command behind a spaced leading redirect, such as `>& x cmd` or `<< EOF cmd`.

The hook stops a careless or mistaken command. A determined one can get past it, for example through a script file. The external uat volume does not depend on the hook: Compose cannot remove it.
