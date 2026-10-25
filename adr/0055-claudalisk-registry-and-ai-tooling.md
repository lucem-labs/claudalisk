# CLA-0055: Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend-conventions
- **Enforced by:** the scaffold; `claude plugin validate`; reviewer

## Decision

- **Claudalisk publishes a shadcn registry** from `registry/` in this repository. It is built with `shadcn build` and served at a URL pinned to a claudalisk release. It holds:
  - the theme file with claudalisk's tokens (CLA-0054);
  - the base components every app needs, built on shadcn components:
    - the app shell and navigation;
    - form fields wired to Problem Details validation errors (CLA-0045);
    - a data table for paged collections that follows `next` and `prev` links (CLA-0042, CLA-0044);
    - an action button that renders only when its action is in `_actions` (CLA-0044);
    - empty, loading and error states for TanStack Query results (CLA-0038).
- **Apps reference it under the `@claudalisk` namespace** in `components.json`, next to the default shadcn registry. A new app's scaffold runs `shadcn add @claudalisk/base`.
- **The plugin configures shadcn's MCP server** through its own MCP configuration, pinned to a `shadcn` version. Agents use it to search and install components from both registries.
- **The scaffold adds shadcn's official Claude Code skill** to the app, pinned to the same version, so an agent knows the CLI, theming and registry conventions.
- Registry components follow claudalisk's own rules: no comments (CLA-0035), token utilities only (CLA-0054), and US English identifiers (CLA-0052).
- The registry has a CI job that builds it and fails on a broken item.

## Consequences

- A new app starts with claudalisk's look and the pieces that connect the UI to the API conventions, instead of rebuilding them.
- The registry's items have tests and versions in this repository, like the rest of claudalisk.
- An update to a registry item reaches an existing app only when it runs `shadcn add` or `shadcn diff` again, which the app does as a normal change.
- Building the registry and its CI job is follow-up work, tracked in its own issue.
