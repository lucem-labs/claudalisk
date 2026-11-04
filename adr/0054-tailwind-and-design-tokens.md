# CLA-0054: Styling is Tailwind CSS v4, with design tokens as CSS variables

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer; CI's `registry` job (the `color-scheme` item's tests)
- **Issue:** #91

## Decision

- Style components and pages with Tailwind CSS v4 utility classes, through the Vite plugin.
- **Design tokens are CSS variables.**
  - Colours, radius, fonts and spacing that carry meaning are CSS variables, such as `--primary`, `--muted` and `--radius`. They are in one theme file: `app/styles/theme.css`.
  - Tailwind's `@theme` maps them to utilities.
  - Components use the token utilities, such as `bg-primary` and `text-muted-foreground`. They never use raw colour values such as `bg-[#1d4ed8]` or `text-blue-700`.
- **Dark mode** redefines the same variables under a `.dark` class. Components do not add their own `dark:` colours.
  - The `.dark` class goes on `<html>` before the first render, from the stored choice or else the system preference (`prefers-color-scheme`). `color-scheme` is set on `<html>` with it, so scrollbars and form controls follow.
  - `main.tsx` calls `applyColorScheme()` from the registry's `color-scheme` item before `createRoot(...).render`.
  - The app shell carries the toggle, and the choice is stored in `localStorage`. Pages do not add their own.
- **The theme file is the only hand-written CSS.** It holds the tokens and the few global element rules. There are no per-component CSS files or CSS modules.
- **An inline `style` holds only values computed from data**, such as sizes, positions and heat colours. Static styling is a utility class.
  - Any colour in an inline `style` is a `color-mix` of tokens, such as `color-mix(in oklch, var(--primary) 40%, var(--muted))`, never a literal colour.
- **Page layouts respond to their own width with container queries** (`@container` and `@sm:`, `@lg:` and the like). A page can sit in the app shell beside a sidebar, in a dialog or in a split view, so the viewport's width says little about its own. Viewport breakpoints (`sm:`, `lg:`) are for the shell.
- Combine class names with `cn` from shadcn's `cn` package, which shadcn's components import. Do not build class strings with string concatenation.

## Consequences

- A rebrand or a theme change is an edit to one file.
- Light and dark mode come from the same tokens, so every component supports both.
- The claudalisk registry ships the theme file, so new apps start with the same tokens (CLA-0055).
- This replaces "plain CSS" in CLA-0014.
