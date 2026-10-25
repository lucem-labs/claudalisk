<p align="center">
  <img src="docs/assets/logo-wide.png" alt="Claudalisk" width="720">
</p>

# Claudalisk

An opinionated [Claude Code](https://code.claude.com) plugin for **vibe-crafting** .NET + React applications.

Vibe-coding is fast but drifts. Claudalisk keeps the speed and adds the craft: you describe what you want, and Claude builds it inside a fixed architecture, through a fixed workflow, with guardrails that catch it when it strays.

> **Status: early.** The design is still being worked out ([#1](https://github.com/lucem-labs/claudalisk/issues/1)). Nothing here is ready to use yet.

## What it does

- **Opinionated.** One stack, one architecture and one way of working, so neither you nor Claude has to decide the structural things again.
- **Guided.** Skills and subagents for the recurring moves, from starting a new app to taking an issue through to a merged pull request.
- **Guardrailed.** Hooks and tests check the rules, so they don't depend on a prompt being followed.
- **Layered on Claude.** It adds to Claude Code's built-in behaviour rather than replacing it, and loads its knowledge only when the work needs it.

## Standards

The standards live once, as architecture decision records in [`adr/`](adr/README.md). Knowledge skills in [`skills/`](skills) index them by area: backend architecture, data and migrations, frontend, testing, workflow and environments, plus cross-cutting code standards that apply to every file. A skill loads automatically when Claude works with files in its area, and Claude opens an ADR only when the work needs it. An app's own `AGENTS.md` wins, and it lists each deviation by ADR id.

## Security

Hooks from this repo run with full access on your machine. **Pin a released version. Never track `main`.**

## Licence

[MIT](LICENSE)

## Not affiliated

Claudalisk is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic (Claude) or Blizzard Entertainment (Hydralisk). All trademarks belong to their owners.
