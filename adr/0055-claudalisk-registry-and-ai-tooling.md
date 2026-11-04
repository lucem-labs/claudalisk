# CLA-0055: Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** the scaffold; `claude plugin validate`; CI's `registry` job; reviewer
- **Issue:** #38, #75, #91, #76

## Decision

- **Claudalisk publishes a shadcn registry** from `registry/` in this repository.
  - `shadcn build` builds `registry/registry.json` into `registry/public/r`, which is committed.
  - It is served from GitHub at the release tag: `https://raw.githubusercontent.com/lucem-labs/claudalisk/v<version>/registry/public/r/{name}.json`, where `<version>` is the plugin's version in `.claude-plugin/plugin.json`. A tag never moves, so an app gets the same items until it moves to a newer release. The release workflow makes the tag and checks that every item resolves at it (CLA-0081).
- **What the registry holds:**
  - `theme`: the theme file with the tokens of claudalisk (CLA-0054), installed as `src/app/styles/theme.css`.
  - The base components that every app needs, built on shadcn components:
    - `app-shell`: the app shell and navigation. It has no business meaning, so it lives in `shared/ui`. The app passes its own navigation from `app` (CLA-0036). Its header carries the dark mode toggle.
    - `color-scheme`: `applyColorScheme` in `shared/lib`, which puts the `.dark` class and `color-scheme` on `<html>` from the stored choice or else the system preference, and `ColorSchemeToggle`, which stores the choice in `localStorage` (CLA-0054).
    - `problem-field` and `problem-alert`: form fields and an alert wired to Problem Details validation errors (CLA-0045). A field shows the errors under its own key. The alert shows the `title`, the `detail` and the validation errors that no field of the form shows. Where one line is enough, `problemMessage` and `ProblemError`'s message give the `detail`, else the first field error, else the `title`.
    - `paged-table`: a data table for paged collections that follows `next` and `prev` links (CLA-0042, CLA-0044).
    - `action-button`: a button that renders only when its action is in `_actions` (CLA-0044).
    - `query-state`: empty, loading and error states for TanStack Query results (CLA-0038).
    - `job`: the job component (CLA-0060). It polls a job until it ends and shows its status, progress, error and cancel action. When a newer job with the same dedupe key supersedes it (CLA-0058), it follows the newest active job of the same kind and input that the page finds, and starts a new one only when there is none.
    - `heading` (`Heading` and `PageHeader`), `section-card`, `disclosure` and `pager`: real headings, a titled card that can be a region named by its heading, a collapsible section in place of `<details>`, and previous and next buttons for lists that are not tables.
    - `table` and `badge`: shadcn's table with a `stacked` variant that turns rows into cards labelled by each cell's `data-label` in a narrow container, and shadcn's badge with `success` and `warning` variants on the theme's tokens of the same names. They replace shadcn's `table` and `badge` in `shared/ui`, so they are updated with `shadcn add @claudalisk/table` or `@claudalisk/badge`, never from `@shadcn` (CLA-0053).
  - The helpers they share:
    - `problem-details` in `shared/lib`;
    - `hypermedia`: types in `shared/lib`, and the requests that follow a link and send an action in `shared/api` (CLA-0014).
  - `base`, which installs all of them.
- **Apps reference it under the `@claudalisk` namespace** in `components.json`, next to the default shadcn registry.
- **The scaffold sets up the design system** with `node tools/add-design-system.mjs --app <frontend folder>`. It:
  - fetches the official Claude Code skill of shadcn first, from the same shadcn version, with `GITHUB_TOKEN` or else `gh auth token`, so a refused request changes nothing;
  - writes `components.json` with the aliases into `shared` and the `@claudalisk` registry;
  - runs `shadcn add @claudalisk/base`, then removes the comments of the installed files (CLA-0053);
  - writes the skill to `.claude/skills/shadcn`, with its commands pinned to that version. `--skill-only` adds just the skill to an app that already has `components.json`.
- **The plugin configures the MCP server of shadcn** in `.mcp.json`, pinned to an exact `shadcn` version. That version is the one the scaffold, the theme and CI use. Agents use the server to search and install components from both registries.
- **Registry components follow the rules of claudalisk:**
  - no comments (CLA-0035);
  - token utilities only (CLA-0054);
  - US English identifiers (CLA-0052).
- **CI's `registry` job checks the registry on GitHub-hosted runners:**
  - It fails on a comment or a raw colour in a registry source.
  - It fails when `registry/public/r` differs from a fresh `shadcn build`.
  - It fails on two files in one folder whose names differ only by case, and on a file in `registry/ui` that is not kebab-case (CLA-0053).
  - It fails when a `registry:ui` item has no `describe` block of its name in the fixture app's `accessibility.test.tsx`.
  - It installs `@claudalisk/base` into a fresh Vite, React and Tailwind v4 app in `registry/fixture-app`, then:
    - checks the installed file names the same way;
    - type-checks and builds the app;
    - runs the components' Vitest and Testing Library tests;
    - runs an axe check on every registry component, and each component's test of its landmarks and roles, such as one `main`, a named `navigation`, a `region` named by its heading or an `alert`. Colour contrast is left out, because jsdom does not render;
    - checks that the scaffold left no comment in the installed files;
    - checks that shadcn's MCP server lists `@claudalisk` and searches `@shadcn`.
- **The components' tests live in the fixture app.** They test the installed copies, as an app receives them. An app's own end-to-end tests cover the components in its screens (CLA-0016).

## Consequences

- A new app starts with the look of claudalisk and the pieces that connect the UI to the API conventions. It does not rebuild them.
- The items of the registry have tests and versions in this repository, like the rest of claudalisk.
- An update to a registry item reaches an app only when the app runs `shadcn add` or `shadcn diff` again. The app does this as a normal change.
- A registry change reaches apps only after a release tag. The plugin's version is bumped in the pull request that should ship one, and the release workflow tags it after the merge (CLA-0081).
- shadcn's own components come from shadcn's live registry when they are added, whatever the pinned CLI version. CI notices when an upstream change breaks the base components.
