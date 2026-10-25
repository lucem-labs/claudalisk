# CLA-0054: Styling is Tailwind CSS v4, with design tokens as CSS variables

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend-conventions
- **Enforced by:** reviewer

## Decision

- Components and pages are styled with Tailwind CSS v4 utility classes, through the Vite plugin.
- **Design tokens are CSS variables.**
  - Colours, radius, fonts and spacing that carry meaning are CSS variables, such as `--primary`, `--muted` and `--radius`, in one theme file: `app/styles/theme.css`.
  - Tailwind's `@theme` maps them to utilities.
  - Components use the token utilities, such as `bg-primary` and `text-muted-foreground`, never raw colour values such as `bg-[#1d4ed8]` or `text-blue-700`.
- **Dark mode** redefines the same variables under a `.dark` class. Components don't add their own `dark:` colours.
- **The theme file is the only hand-written CSS.** It holds the tokens and the few global element rules. There are no per-component CSS files, CSS modules or inline `style` attributes for static styling.
- Class names are combined with `cn` from `shared/lib`. Class strings aren't built with string concatenation.

## Consequences

- A rebrand or a theme change is an edit to one file.
- Light and dark mode come from the same tokens, so every component supports both.
- The claudalisk registry ships the theme file, so new apps start with the same tokens (CLA-0055).
- This replaces "plain CSS" in CLA-0014.
