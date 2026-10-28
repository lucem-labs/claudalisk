# CLA-0055: Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** the scaffold; `claude plugin validate`; CI's `registry` job; reviewer
- **Issue:** #38

## Decision

- **Claudalisk publishes a shadcn registry** from `registry/` in this repository.
  - `shadcn build` builds `registry/registry.json` into `registry/public/r`, which is committed.
  - It is served from GitHub at the release tag: `https://raw.githubusercontent.com/lucem-labs/claudalisk/v<version>/registry/public/r/{name}.json`, where `<version>` is the plugin's version in `.claude-plugin/plugin.json`. A tag never moves, so an app gets the same items until it moves to a newer release.
- **What the registry holds:**
  - `theme`: the theme file with the tokens of claudalisk (CLA-0054), installed as `src/app/styles/theme.css`.
  - The base components that every app needs, built on shadcn components:
    - `app-shell`: the app shell and navigation. It has no business meaning, so it lives in `shared/ui`. The app passes its own navigation from `app` (CLA-0036).
    - `problem-field` and `problem-alert`: form fields and an alert wired to Problem Details validation errors (CLA-0045).
    - `paged-table`: a data table for paged collections that follows `next` and `prev` links (CLA-0042, CLA-0044).
    - `action-button`: a button that renders only when its action is in `_actions` (CLA-0044).
    - `query-state`: empty, loading and error states for TanStack Query results (CLA-0038).
  - The helpers they share:
    - `problem-details` in `shared/lib`;
    - `hypermedia`: types in `shared/lib`, and the requests that follow a link and send an action in `shared/api` (CLA-0014).
  - `base`, which installs all of them.
- **Apps reference it under the `@claudalisk` namespace** in `components.json`, next to the default shadcn registry.
- **The scaffold sets up the design system** with `node tools/add-design-system.mjs --app <frontend folder>`. It:
  - writes `components.json` with the aliases into `shared` and the `@claudalisk` registry;
  - runs `shadcn add @claudalisk/base`;
  - adds the official Claude Code skill of shadcn to `.claude/skills/shadcn`, from the same shadcn version, with its commands pinned to that version.
- **The plugin configures the MCP server of shadcn** in `.mcp.json`, pinned to an exact `shadcn` version. That version is the one the scaffold, the theme and CI use. Agents use the server to search and install components from both registries.
- **Registry components follow the rules of claudalisk:**
  - no comments (CLA-0035);
  - token utilities only (CLA-0054);
  - US English identifiers (CLA-0052).
- **CI's `registry` job checks the registry on GitHub-hosted runners:**
  - It fails on a comment or a raw colour in a registry source.
  - It fails when `registry/public/r` differs from a fresh `shadcn build`.
  - It installs `@claudalisk/base` into a fresh Vite, React and Tailwind v4 app in `registry/fixture-app`, then:
    - type-checks and builds the app;
    - runs the components' Vitest and Testing Library tests;
    - checks that shadcn's MCP server lists `@claudalisk` and searches `@shadcn`.
- **The components' tests live in the fixture app.** They test the installed copies, as an app receives them. An app's own end-to-end tests cover the components in its screens (CLA-0016).

## Consequences

- A new app starts with the look of claudalisk and the pieces that connect the UI to the API conventions. It does not rebuild them.
- The items of the registry have tests and versions in this repository, like the rest of claudalisk.
- An update to a registry item reaches an app only when the app runs `shadcn add` or `shadcn diff` again. The app does this as a normal change.
- A registry change reaches apps only after a release tag. The plugin's version is bumped in the pull request that should ship one.
- shadcn's own components come from shadcn's live registry when they are added, whatever the pinned CLI version. CI notices when an upstream change breaks the base components.
