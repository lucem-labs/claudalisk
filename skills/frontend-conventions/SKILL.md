---
name: frontend-conventions
description: Claudalisk frontend decisions (ADRs) - React, TypeScript and Vite, one typed API module for every backend call, and a UI that renders API values without duplicating backend rules. Use when writing or reviewing frontend code, components or API calls in a claudalisk app.
paths:
  - "frontend/src/**"
user-invocable: false
---

# Frontend conventions

These are claudalisk's decisions for frontend code. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0014](${CLAUDE_PLUGIN_ROOT}/adr/0014-frontend-stack-and-api-module.md) (accepted): React, TypeScript and Vite; every backend call goes through one typed API module.
- [CLA-0015](${CLAUDE_PLUGIN_ROOT}/adr/0015-ui-renders-api-values.md) (accepted): the UI renders what the API returns and never re-implements business rules.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): a UI change comes with a Playwright end-to-end test.
