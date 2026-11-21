# CLA-0097: The plugin is off at user scope, and each app turns it on in its project settings

- **Status:** accepted
- **Date:** 2026-11-21
- **Area:** workflow
- **Enforced by:** the app template's `.claude/settings.json` and its `new-app` test; reviewer (CLA-0023)
- **Issue:** #254

## Context

A plugin enabled at user scope loads its hooks and skills in every folder on the machine. claudalisk's hooks guard app work: the guardrail, the session start line and the CI poll guard. In repositories that are not claudalisk apps they get in the way of work that follows other rules.

`enabledPlugins` in a project's `.claude/settings.json` overrides the user setting for sessions started in that folder. An untracked `.claude/settings.local.json` does the same, but it does not reach the issue worktrees that `work-issue` creates, because a new worktree has only tracked files.

Rejected option: leaving the plugin on everywhere and having each hook skip folders that are not apps. The skills and agents would still load in every session.

## Decision

- **The owner turns the plugin off in user settings:** `"enabledPlugins": { "claudalisk@claudalisk": false }`.
- **Each app turns it on in its committed `.claude/settings.json`:** `"enabledPlugins": { "claudalisk@claudalisk": true }`. Every checkout and worktree of the app gets it.
- A generated app has the setting from the start. An existing app adds it to its `.claude/settings.json`.

## Consequences

- Sessions outside apps load none of claudalisk's hooks, skills or agents.
- A session started in a folder above the apps, such as the folder that holds every clone, has no claudalisk either. App work starts in the app's checkout or worktree.
