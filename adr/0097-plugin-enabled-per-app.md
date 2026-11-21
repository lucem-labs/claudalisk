# CLA-0097: The plugin is off at user scope, and each app turns it on in its project settings

- **Status:** accepted
- **Date:** 2026-11-21
- **Area:** workflow
- **Enforced by:** the app template's `.claude/settings.json` and its `new-app` test; reviewer (CLA-0023)
- **Issue:** #254, #242

## Context

A plugin enabled at user scope loads its hooks and skills in every folder on the machine. claudalisk's hooks guard app work: the guardrail, the session start line and the CI poll guard. In repositories that are not claudalisk apps they get in the way of work that follows other rules.

`enabledPlugins` in a project's `.claude/settings.json` overrides the user setting for sessions started in that folder. An untracked `.claude/settings.local.json` does the same, but it does not reach the issue worktrees that `work-issue` creates, because a new worktree has only tracked files.

Rejected option: leaving the plugin on everywhere and relying on each hook to skip folders that are not apps. The skills and agents would still load in every session. The plugin can still load outside an app, for example from a folder above the apps or through `--plugin-dir`, so the hooks that enforce an app's workflow check for an app too.

## Decision

- **The owner turns the plugin off in user settings:** `"enabledPlugins": { "claudalisk@claudalisk": false }`.
- **Each app turns it on in its committed `.claude/settings.json`:** `"enabledPlugins": { "claudalisk@claudalisk": true }`. Every checkout and worktree of the app gets it.
- A generated app has the setting from the start. An existing app adds it to its `.claude/settings.json`.
- **A hook rule that assumes an app steps aside when no `.claude/claudalisk.json` is found** from the command's directory up to the repository root.
  - Guardrail rules 5 and 6 (CLA-0024, CLA-0023): a push to the default branch, `gh pr merge`, the merge API and `gh pr create` are not checked there. The CI poll guard (CLA-0076) and the migration guard (CLA-0010) do the same.
  - The rules that protect machine-wide resources stay on everywhere: the protected uat, proxy and runners names, destructive Compose verbs, env file writes, opaque PowerShell, rule 4 and the asks. So does `stack-config-guard.mjs`, which reads the registry.
  - When the directory is unknown or the config cannot be read, the rules apply.
- The claudalisk repository has no app config, so rules 5 and 6 do not apply in it. Its own instructions and the repository's rules on GitHub keep the owner-merges flow there.

## Consequences

- Sessions outside apps load none of claudalisk's hooks, skills or agents. A session that loads the plugin outside an app can push to and merge into that repository's default branch.
- A session started in a folder above the apps, such as the folder that holds every clone, has no claudalisk either. App work starts in the app's checkout or worktree.
