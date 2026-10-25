---
name: frontend
description: Claudalisk frontend decisions (ADRs). Covers React, TypeScript and Vite with React Router 7, oxlint, Vitest and generated OpenAPI types; Feature-Sliced Design layers and slices, pages first, entities that mirror backend modules; server state in TanStack Query and shared client state in Zustand stores; Steiger boundary checks; a UI that renders API values and hypermedia actions without duplicating backend rules; Problem Details and jobs; and the design system (shadcn/ui, Tailwind CSS v4 and design tokens, the claudalisk registry). Use when writing, reviewing or restructuring frontend code, folders, imports, state, components, styles or API calls in a claudalisk app.
paths:
  - "frontend/src/**"
  - "frontend/components.json"
  - "frontend/steiger.config.*"
user-invocable: false
---

# Frontend

These are claudalisk's decisions for frontend code. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0014](${CLAUDE_PLUGIN_ROOT}/adr/0014-frontend-stack-and-api-module.md) (accepted): React, TypeScript and Vite, styled by CLA-0053 and CLA-0054 once accepted. Every backend call goes through a typed API layer: one client in `shared/api` and an `api` segment per entity.
- [CLA-0065](${CLAUDE_PLUGIN_ROOT}/adr/0065-frontend-tooling.md) (proposed): React Router 7, oxlint, Vitest for `model` and `lib` logic, and `openapi-typescript` types with an `openapi-fetch` client.
- [CLA-0015](${CLAUDE_PLUGIN_ROOT}/adr/0015-ui-renders-api-values.md) (accepted): the UI renders what the API returns and never re-implements business rules.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): a UI change comes with a Playwright end-to-end test, and store or helper logic with a Vitest test.
- [CLA-0036](${CLAUDE_PLUGIN_ROOT}/adr/0036-feature-sliced-design-pages-first.md) (proposed): Feature-Sliced Design layers with downward-only imports and a public API per slice. Code starts in its page and moves down on its second use.
- [CLA-0037](${CLAUDE_PLUGIN_ROOT}/adr/0037-entities-mirror-backend-modules.md) (proposed): one entity slice per backend module, calling only that module's endpoints.
- [CLA-0038](${CLAUDE_PLUGIN_ROOT}/adr/0038-server-state-in-tanstack-query.md) (proposed): read and write API data only through TanStack Query hooks exported by entity `api` segments, and never fetch in `useEffect`.
- [CLA-0039](${CLAUDE_PLUGIN_ROOT}/adr/0039-client-state-in-zustand-stores.md) (proposed): shared client state lives in Zustand stores in a slice's `model` segment. Components subscribe through selectors and change state only through actions.
- [CLA-0040](${CLAUDE_PLUGIN_ROOT}/adr/0040-frontend-boundaries-linted.md) (proposed): Steiger checks the layer boundaries in CI.
- [CLA-0044](${CLAUDE_PLUGIN_ROOT}/adr/0044-hypermedia-links-and-actions.md) (proposed): representations carry HAL-style `_links` and the `_actions` the aggregate allows now, and the UI shows only those actions.
- [CLA-0045](${CLAUDE_PLUGIN_ROOT}/adr/0045-http-semantics-and-problem-details.md) (proposed): standard status codes, RFC 9457 Problem Details with a `type` per domain error, and ETag with If-Match on writes.
- [CLA-0046](${CLAUDE_PLUGIN_ROOT}/adr/0046-openapi-document.md) (proposed): the OpenAPI document groups endpoints by module. Frontend API types are generated from it and checked in CI.
- [CLA-0060](${CLAUDE_PLUGIN_ROOT}/adr/0060-jobs-router-and-job-resource.md) (proposed): module endpoints start jobs and return `202` with a link to `/api/jobs/{module}/{id}`; poll the job and follow its `result` link.
- [CLA-0053](${CLAUDE_PLUGIN_ROOT}/adr/0053-shadcn-ui-design-system.md) (proposed): shadcn/ui is the design system. Add components only through its CLI or MCP server into `shared/ui`, and compose them in screens instead of restyling them.
- [CLA-0054](${CLAUDE_PLUGIN_ROOT}/adr/0054-tailwind-and-design-tokens.md) (proposed): Tailwind CSS v4 utilities over design tokens defined as CSS variables in one theme file, with no raw colours, per-component CSS or inline styles.
- [CLA-0055](${CLAUDE_PLUGIN_ROOT}/adr/0055-claudalisk-registry-and-ai-tooling.md) (proposed): claudalisk ships an `@claudalisk` shadcn registry with its theme and base components. The plugin configures shadcn's MCP server and the scaffold adds its skill.
