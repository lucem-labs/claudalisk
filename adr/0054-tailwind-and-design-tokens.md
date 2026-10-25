# CLA-0054: Styling is Tailwind CSS v4, with design tokens as CSS variables

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer

## Decision

- Style components and pages with Tailwind CSS v4 utility classes, through the Vite plugin.
- **Design tokens are CSS variables.**
  - Colours, radius, fonts and spacing that carry meaning are CSS variables, such as `--primary`, `--muted` and `--radius`. They are in one theme file: `app/styles/theme.css`.
  - Tailwind's `@theme` maps them to utilities.
  - Components use the token utilities, such as `bg-primary` and `text-muted-foreground`. They never use raw colour values such as `bg-[#1d4ed8]` or `text-blue-700`.
- **Dark mode** redefines the same variables under a `.dark` class. Components do not add their own `dark:` colours.
- **The theme file is the only hand-written CSS.** It holds the tokens and the few global element rules. There are no per-component CSS files, CSS modules or inline `style` attributes for static styling.
- Combine class names with `cn` from `shared/lib`. Do not build class strings with string concatenation.

## Consequences

- A rebrand or a theme change is an edit to one file.
- Light and dark mode come from the same tokens, so every component supports both.
- The claudalisk registry ships the theme file, so new apps start with the same tokens (CLA-0055).
- This replaces "plain CSS" in CLA-0014.
