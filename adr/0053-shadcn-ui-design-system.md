# CLA-0053: shadcn/ui is the design system, and its components live in `shared/ui`

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend-conventions
- **Enforced by:** reviewer; Steiger (CLA-0040)

## Context

The existing apps styled every screen by hand in plain CSS, so each new screen invented its own buttons, forms and tables. Claudalisk apps are built mostly by agents, so the design system has to be one that an agent can use correctly without guessing.

[shadcn/ui](https://ui.shadcn.com) is the React design system with the most complete AI tooling:
- an official MCP server for finding and installing components;
- an official Claude Code skill;
- `llms.txt` documentation;
- a CLI that reports the project's setup.

Its components are copied into the app as source, so an agent reads and edits the real code instead of guessing a package's props. It is also what most AI app builders generate, so models know it well.

Alternatives considered:
- **Mantine:** broad and plain-CSS friendly, but with no official MCP server or skill.
- **MUI:** has an official MCP server, but it's CSS-in-JS and its strong data grid is paid.
- **Chakra UI and HeroUI:** each has an official MCP server, but both are smaller.

## Decision

- The design system is shadcn/ui, on Tailwind CSS v4 (CLA-0054), with Radix primitives.
- **Components are added only through the shadcn CLI or its MCP server**, from the claudalisk registry first and the shadcn registry second (CLA-0055). They are never copied in by hand from a website.
- **Components live in `shared/ui`** (CLA-0036). `components.json` points the CLI's aliases there, and `cn` and other helpers go in `shared/lib`.
- **Pages and features compose components; they don't restyle them.**
  - A screen uses a `shared/ui` component wherever one exists, instead of a styled raw HTML element.
  - A new variant is added to the component, such as a `cva` variant, not overridden with classes at the call site.
- **Tables and charts are built from recipes.** Tables use the shadcn data table recipe on TanStack Table, and charts use the shadcn chart components on Recharts.
- **Copied components belong to the app.** They follow the app's rules, including no comments (CLA-0035). An agent checks for upstream fixes with `shadcn diff` when it touches a component, and applies them as a normal change.

## Consequences

- Every claudalisk app looks and behaves alike, and an agent finds every component the same way.
- Accessibility comes from the Radix primitives instead of being rebuilt for each screen.
- The app maintains its copied components. Upstream fixes arrive through `shadcn diff`, not through a version bump.
- Existing apps move screen by screen, and list this ADR as a deviation in their `AGENTS.md` until they're done (CLA-0028).
