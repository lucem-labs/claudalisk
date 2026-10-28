# CLA-0053: shadcn/ui is the design system, and its components live in `shared/ui`

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer; Steiger (CLA-0040)

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
- **Tables and charts use recipes.** Tables use the shadcn data table recipe on TanStack Table. Charts use the shadcn chart components on Recharts.
- **Copied components belong to the app.** They follow the app's rules, including no comments (CLA-0035). shadcn's components ship without comments. If an upstream update brings one in, the agent removes it. When an agent touches a component, it checks for upstream fixes with `shadcn diff` and applies them as a normal change.

## Consequences

- Every claudalisk app looks and behaves alike, and an agent finds every component the same way.
- Accessibility comes from the Radix primitives. Nobody rebuilds it for each screen.
- The app maintains its copied components. Upstream fixes arrive through `shadcn diff`, not through a version bump.
