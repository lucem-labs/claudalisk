<p align="center">
  <img src="docs/assets/logo-wide.png" alt="Claudalisk" width="720">
</p>

# Claudalisk

An opinionated [Claude Code](https://code.claude.com) plugin for **vibe-crafting** .NET + React applications.

Vibe-coding is fast but drifts. Claudalisk keeps the speed and adds the craft: you describe what you want, and Claude builds it inside a fixed architecture, through a fixed workflow, with guardrails that catch it when it strays.

> **Status: early.** Releases are tagged and in use, but every artifact is still at 0.y.z, where a minor version can break ([CLA-0098](adr/0098-artifacts-follow-semantic-versioning.md)). The [releases](https://github.com/lucem-labs/claudalisk/releases) list what changed.

## What it does

- **Opinionated.** One stack, one architecture and one way of working, so neither you nor Claude has to decide the structural things again.
- **Guided.** Skills and subagents for the recurring moves: `/claudalisk:new-app` generates a complete app, and others add a module or a migration.
- **Reviewed.** `/claudalisk:review` reviews a branch before its pull request opens. A script plans the review from the diff, Opus reviewer agents check it against the ADRs and for uat data safety, the built-in `/code-review` checks correctness and security, and three models form a quorum only where a change can lose uat data.
- **Lifecycle.** `/claudalisk:work-issue` takes an issue from its worktree through implementation, review and the uat review deploy to the owner's merge. A status script reads the step an issue is at, and a workflow runs the implement and review stretch.
- **Environments.** Each app runs in two local environments behind one shared proxy: dev for the agent, and uat for the owner's real data. A deploy to uat is guarded and backed up first, and CI runs on shared self-hosted runners.
- **Guardrailed.** Hooks and tests check the rules, so they don't depend on a prompt being followed.
- **Layered on Claude.** It adds to Claude Code's built-in behaviour rather than replacing it, and loads its knowledge only when the work needs it.

## Standards

The standards are architecture decision records in [`adr/`](adr/README.md). Each one is written once. Knowledge skills in [`skills/`](skills) index them by area: backend architecture, data and migrations, frontend, testing, workflow and environments. Code standards apply to every file, and the workflow skill also covers how sessions stay small. A skill loads when Claude works with files in its area or on a task it covers, and Claude opens an ADR only when the work needs it. An app's `AGENTS.md` wins, and it lists each deviation by ADR id.

## Design system

Apps use shadcn/ui on Tailwind CSS v4. The [`@claudalisk` registry](registry/README.md) ships claudalisk's theme and the base components that connect the UI to the API conventions. The plugin starts shadcn's MCP server, so Claude can search and add components from both registries.

## New apps

`/claudalisk:new-app` generates an app from [`templates/`](templates/README.md): the .NET modular monolith, the React frontend, CI, the environment scripts and the end-to-end harness. It needs .NET 10, Node 24, Docker and a signed-in `gh`.

## Artifacts and versions

| Artifact | Where it lives | How an app pins it |
|---|---|---|
| The plugin | This repository, tagged `v<version>` | The marketplace `ref` |
| The `@claudalisk` registry | [`registry/`](registry/README.md), served at the plugin's tag | The tag in the registry URL |
| [`@claudalisk/scripts`](packages/scripts/README.md) | `packages/scripts`, on npm | An exact version in `package.json` |
| The `Claudalisk.*` packages | [lucem-labs/claudalisk-dotnet](https://github.com/lucem-labs/claudalisk-dotnet), on nuget.org | Exact versions in `Directory.Packages.props` |

Every version follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) ([CLA-0098](adr/0098-artifacts-follow-semantic-versioning.md)). While an artifact is at 0.y.z, a breaking change bumps the minor version and everything else bumps the patch. A workflow tags and publishes each release ([CLA-0081](adr/0081-releases-tagged-by-a-workflow.md)), and a released version never changes.

## Install

The repository is its own plugin marketplace. Add it at a [release](https://github.com/lucem-labs/claudalisk/releases) tag, then install the plugin:

```
/plugin marketplace add lucem-labs/claudalisk@v<version>
/plugin install claudalisk@claudalisk
```

Then turn it off in your user settings, so it loads only in apps ([CLA-0097](adr/0097-plugin-enabled-per-app.md)):

```json
{ "enabledPlugins": { "claudalisk@claudalisk": false } }
```

A generated app turns it on in its own `.claude/settings.json`. An existing app adds `"enabledPlugins": { "claudalisk@claudalisk": true }` there.

## Security

Hooks from this repo run with full access on your machine. **Pin a released version, as the install command above does. Never track `main`.**

## Licence

[MIT](LICENSE)

## Not affiliated

Claudalisk is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic (Claude) or Blizzard Entertainment (Hydralisk). All trademarks belong to their owners.
