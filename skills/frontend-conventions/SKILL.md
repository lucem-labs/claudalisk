---
name: frontend-conventions
description: Claudalisk frontend decisions (ADRs) - React, TypeScript and Vite, a typed API layer for every backend call, a UI that renders API values without duplicating backend rules, and the design system: shadcn/ui components, Tailwind CSS v4 and design tokens, and the claudalisk registry. Use when writing or reviewing frontend code, components, styles or API calls in a claudalisk app.
paths:
  - "frontend/src/**"
  - "frontend/components.json"
user-invocable: false
---

# Frontend conventions

These are claudalisk's decisions for frontend code. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0014](${CLAUDE_PLUGIN_ROOT}/adr/0014-frontend-stack-and-api-module.md) (accepted): React, TypeScript and Vite, styled by CLA-0053 and CLA-0054 once accepted; every backend call goes through a typed API layer.
- [CLA-0015](${CLAUDE_PLUGIN_ROOT}/adr/0015-ui-renders-api-values.md) (accepted): the UI renders what the API returns and never re-implements business rules.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): a UI change comes with a Playwright end-to-end test.
- [CLA-0053](${CLAUDE_PLUGIN_ROOT}/adr/0053-shadcn-ui-design-system.md) (proposed): shadcn/ui is the design system; components are added only through its CLI or MCP server into `shared/ui`, and screens compose them instead of restyling them.
- [CLA-0054](${CLAUDE_PLUGIN_ROOT}/adr/0054-tailwind-and-design-tokens.md) (proposed): Tailwind CSS v4 utilities over design tokens defined as CSS variables in one theme file; no raw colours, per-component CSS or inline styles.
- [CLA-0055](${CLAUDE_PLUGIN_ROOT}/adr/0055-claudalisk-registry-and-ai-tooling.md) (proposed): claudalisk ships an `@claudalisk` shadcn registry with its theme and base components; the plugin configures shadcn's MCP server and the scaffold adds its skill.
