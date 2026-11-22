# CLA-0055: Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** the scaffold; `claude plugin validate`; CI's `registry` job; reviewer
- **Issue:** #38, #75, #91, #76

## Context

Every app needs the same pieces that connect the UI to claudalisk's API conventions: Problem Details forms, hypermedia actions, paged tables, job progress, query states and the theme. Rebuilt in each app, they drift. A shadcn registry delivers them as source that the shadcn CLI installs and updates, the same way as shadcn's own components (CLA-0053).

## Decision

- **Claudalisk publishes a shadcn registry** from `registry/` in this repository. `shadcn build` builds it into `registry/public/r`, which is committed.
- **It is served from GitHub at the release tag:** `https://raw.githubusercontent.com/lucem-labs/claudalisk/v<version>/registry/public/r/{name}.json`, where `<version>` is the plugin's version. The registry has no version of its own, and its items are part of the plugin's public API (CLA-0098). A tag never moves, so an app gets the same items until it moves to a newer release. The release workflow makes the tag and checks that every item resolves at it (CLA-0081).
- **It holds the theme and the base components every app needs,** with the helpers they share. They include the theme tokens (CLA-0054), the app shell, Problem Details fields and alerts (CLA-0045), a paged table (CLA-0042), an action button (CLA-0044), query states (CLA-0038) and the job component (CLA-0060). `base` installs all of them. `registry/README.md` lists every item and what it does.
- **`table` and `badge` replace shadcn's files of the same names** with added variants. They are updated only from `@claudalisk`, never from `@shadcn` (CLA-0053).
- **Apps reference it under the `@claudalisk` namespace** in `components.json`, next to the default shadcn registry.
- **The scaffold sets up the design system** with `node tools/add-design-system.mjs --app <frontend folder>`. It:
  - fetches shadcn's official Claude Code skill first, so a refused request changes nothing;
  - writes `components.json` with aliases into `shared` and the `@claudalisk` registry;
  - runs `shadcn add @claudalisk/base` and removes the installed files' comments (CLA-0035);
  - writes the skill to `.claude/skills/shadcn`, with its commands pinned to the same shadcn version.
- **The plugin configures shadcn's MCP server** in `.mcp.json`, pinned to the exact `shadcn` version that the scaffold, the theme and CI use. Agents use it to search and install from both registries.
- **Registry components follow claudalisk's rules:** no comments (CLA-0035), token utilities only (CLA-0054) and US English identifiers (CLA-0052).
- **CI's `registry` job checks the registry** on GitHub-hosted runners: comments and raw colours, the build output, file names, and an install into a fresh Vite app whose tests include an axe check of every component. `registry/README.md` lists each check.
- **The components' tests live in the fixture app,** so they test the installed copies, as an app receives them. An app's own end-to-end tests cover the components in its screens (CLA-0070).

## Consequences

- A new app starts with claudalisk's look and the pieces that connect the UI to the API conventions.
- Registry items have tests and versions in this repository, like the rest of claudalisk.
- An update reaches an app only when the app runs `shadcn add` or `shadcn diff` again, as a normal change, and only after a release tag (CLA-0081).
- shadcn's own components come from shadcn's live registry when they are added, whatever the pinned CLI version. CI notices when an upstream change breaks the base components.
