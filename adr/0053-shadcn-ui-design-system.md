# CLA-0053: shadcn/ui is the design system, and its components live in `shared/ui`

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer; Steiger (CLA-0040); the scaffold and the app's comment check (CLA-0035); CI's `registry` job (file names)
- **Issue:** #75, #91

## Context

When every screen is styled by hand in plain CSS, each new screen invents its own buttons, forms and tables. Agents build most claudalisk apps. The design system must be one that an agent can use correctly without guessing.

[shadcn/ui](https://ui.shadcn.com) is the React design system with the most complete AI tooling:
- an official MCP server to find and install components
- an official Claude Code skill
- `llms.txt` documentation
- a CLI that reports the project's setup

The CLI copies its components into the app as source. An agent reads and edits the real code instead of guessing a package's props. Most AI app builders also generate shadcn/ui, so models know it well.

Alternatives considered:
- **Mantine:** broad and friendly to plain CSS, but it has no official MCP server or skill.
- **MUI:** has an official MCP server, but it uses CSS-in-JS and its strong data grid is paid.
- **Chakra UI and HeroUI:** each has an official MCP server, but both are smaller.

## Decision

- The design system is shadcn/ui, on Tailwind CSS v4 (CLA-0054), with Radix primitives.
- **Add components only through the shadcn CLI or its MCP server**, from the claudalisk registry first and the shadcn registry second (CLA-0055). Never copy them by hand from a website.
- **Components live in `shared/ui`** (CLA-0036). `components.json` points the CLI's aliases there, and helpers go in `shared/lib`.
- **Pages and features compose components. They do not restyle them.**
  - A screen uses a `shared/ui` component where one exists, instead of a styled raw HTML element.
  - Add a new variant to the component, such as a `cva` variant. Do not override it with classes at the call site.
- **Forms use `NativeSelect`.** shadcn's `native-select` is a styled `<select>`, so it works with the keyboard, the browser's autofill and phone pickers. The Radix `Select` is only for menus whose items are richer than text, such as items with icons or descriptions.
- **File names in `shared/ui` say what they hold:**
  - Every file in `shared/ui` is kebab-case, like shadcn's own.
  - A file named after a shadcn component holds that component: shadcn's own, or the `@claudalisk` registry's override of it, such as `table` and `badge`. An override replaces shadcn's file the way shadcn's registry docs show ("install a block and override primitives").
  - An app never gives a shadcn component's name to a different component, and never wraps a shadcn component to change it. It adds a variant to the component's file.
  - A variant an app needs on a registry override is added in the registry, because apps update those files from it with `shadcn add @claudalisk/<item>`. A variant added in the app is lost at the next update.
  - CI's `registry` job fails two files in one folder whose names differ only by case, which collide on Windows and macOS, and a file in `registry/ui` or in the installed `shared/ui` that is not kebab-case.
- **Tables and charts use recipes.** Tables use the shadcn data table recipe on TanStack Table. Charts use the shadcn chart components on Recharts.
- **Copied components belong to the app.** They follow the app's rules, including no comments (CLA-0035). When an agent touches a component, it checks for upstream fixes with `shadcn diff` and applies them as a normal change.
  - Some of shadcn's components ship with comments, such as `sidebar.tsx` and `chart.tsx`. The scaffold removes them when it installs the base (CLA-0055). After a later `shadcn add` or an upstream fix, the agent runs `node tools/strip-comments.mjs --app <frontend folder>` from claudalisk, which removes the comments under `src/shared` and keeps lint directives.
  - `table.tsx` and `badge.tsx` in `shared/ui` come from `@claudalisk`, which adds variants to shadcn's (CLA-0055). The agent updates them from `@claudalisk` and never overwrites them with shadcn's own, with `--overwrite` or by applying a `shadcn diff` against `@shadcn`.
  - shadcn's files export variants beside their components, such as `buttonVariants`. The template's oxlint configuration turns `react/only-export-components` off in `shared/ui` only, so the warning stays meaningful in the rest of the app.
- **An existing app moves onto the design system in steps**, by the recipe in the registry's README: its old stylesheet goes into `@layer base`, its variables are renamed and pointed at the tokens, its element rules skip shadcn's components, and its pages are restyled one by one until the stylesheet is deleted. Until then, an `AGENTS.md` deviation names the issue that deletes it (CLA-0028).

## Consequences

- Every claudalisk app looks and behaves alike, and an agent finds every component the same way.
- Accessibility comes from the Radix primitives. Nobody rebuilds it for each screen.
- The app maintains its copied components. Upstream fixes arrive through `shadcn diff`, not through a version bump.
