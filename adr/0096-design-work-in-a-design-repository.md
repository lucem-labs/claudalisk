# CLA-0096: Design work lives in a separate design repository, and apps turn Artifacts off

- **Status:** accepted
- **Date:** 2026-11-20
- **Area:** workflow
- **Enforced by:** the app template's `.claude/settings.json` and its `new-app` test; reviewer (CLA-0023)
- **Issue:** #252

## Context

Design systems and design canvases are made as claude.ai artifacts through Claude Code's Artifact tool. The tool's definition is sent with every request of a session, whether or not the session designs anything. Measured over four weeks of sessions, it was about a tenth of a main-thread request's fixed context, and almost all of its calls came from two design sessions.

`"enableArtifact": false` in a project's `.claude/settings.json` turns the tool off for sessions started in that folder. A project can only turn it off. A session with Artifacts off cannot do design work, because design systems and canvases are Artifact types.

Rejected option: keeping design folders in each app repository with Artifacts on. Every app session would pay for a tool that only design sessions use.

## Decision

- **Design source lives outside app repositories.** The owner keeps one private design repository with a folder per product. It holds the design systems, screens, mockups, source images and snapshots of the live artifacts.
- **Apps turn Artifacts off.** A generated app's `.claude/settings.json` sets `"enableArtifact": false`, next to the plugin setting of CLA-0097.
- **Design sessions start in the design repository**, which leaves Artifacts on. A design session that needs the app's real tokens or components adds the app repository as an extra folder.
- **App sessions read the design from disk.** An app session reads the snapshot in the design repository and cannot open the artifact.
- **A design that needs an app change becomes an issue** in the app's repository and follows the app's flow (CLA-0021).
- The app's `AGENTS.md` names the design repository folder for the app.

## Consequences

- App sessions save the Artifact tool's tokens on every request.
- A design change and the app change it needs land in two repositories, linked by the app issue.
- An existing app moves any design folder to the owner's design repository, then adds the setting to its `.claude/settings.json`.
