# CLA-0055: Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** the scaffold; `claude plugin validate`; reviewer
- **Issue:** #38

## Decision

- **Claudalisk publishes a shadcn registry** from `registry/` in this repository. `shadcn build` builds it, and it is served at a URL pinned to a claudalisk release. It holds:
  - the theme file with the tokens of claudalisk (CLA-0054)
  - the base components that every app needs, built on shadcn components:
    - the app shell and navigation
    - form fields wired to Problem Details validation errors (CLA-0045)
    - a data table for paged collections that follows `next` and `prev` links (CLA-0042, CLA-0044)
    - an action button that renders only when its action is in `_actions` (CLA-0044)
    - empty, loading and error states for TanStack Query results (CLA-0038)
- **Apps reference it under the `@claudalisk` namespace** in `components.json`, next to the default shadcn registry. The scaffold of a new app runs `shadcn add @claudalisk/base`.
- **The plugin configures the MCP server of shadcn** through its own MCP configuration, pinned to a `shadcn` version. Agents use it to search and install components from both registries.
- **The scaffold adds the official Claude Code skill of shadcn** to the app, pinned to the same version. The skill teaches an agent the CLI, theming and registry conventions.
- Registry components follow the rules of claudalisk: no comments (CLA-0035), token utilities only (CLA-0054), and US English identifiers (CLA-0052).
- A CI job builds the registry and fails on a broken item.

## Consequences

- A new app starts with the look of claudalisk and the pieces that connect the UI to the API conventions. It does not rebuild them.
- The items of the registry have tests and versions in this repository, like the rest of claudalisk.
- An update to a registry item reaches an existing app only when the app runs `shadcn add` or `shadcn diff` again. The app does this as a normal change.
- #38 tracks the registry's build, its CI job and the MCP configuration of the plugin.
