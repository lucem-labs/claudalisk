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

- [CLA-0014](${CLAUDE_PLUGIN_ROOT}/adr/0014-frontend-stack-and-api-module.md) (accepted): React, TypeScript and Vite, styled by CLA-0053 and CLA-0054. Every backend call goes through a typed API layer: one client in `shared/api` and an `api` segment per entity.
- [CLA-0065](${CLAUDE_PLUGIN_ROOT}/adr/0065-frontend-tooling.md) (accepted): React Router 7, oxlint, Vitest for `model` and `lib` logic, and `openapi-typescript` types with an `openapi-fetch` client.
- [CLA-0015](${CLAUDE_PLUGIN_ROOT}/adr/0015-ui-renders-api-values.md) (accepted): the UI renders what the API returns and never re-implements business rules.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): Every behaviour change ships with tests.
- [CLA-0036](${CLAUDE_PLUGIN_ROOT}/adr/0036-feature-sliced-design-pages-first.md) (accepted): Feature-Sliced Design layers with downward-only imports and a public API per slice. Code starts in its page and moves down on its second use.
- [CLA-0037](${CLAUDE_PLUGIN_ROOT}/adr/0037-entities-mirror-backend-modules.md) (accepted): one entity slice per backend module, named after it and so singular, calling only that module's endpoints.
- [CLA-0038](${CLAUDE_PLUGIN_ROOT}/adr/0038-server-state-in-tanstack-query.md) (accepted): read and write API data only through TanStack Query hooks exported by entity `api` segments, and never fetch in `useEffect`.
- [CLA-0039](${CLAUDE_PLUGIN_ROOT}/adr/0039-client-state-in-zustand-stores.md) (accepted): shared client state lives in Zustand stores in a slice's `model` segment. Components subscribe through selectors and change state only through actions.
- [CLA-0040](${CLAUDE_PLUGIN_ROOT}/adr/0040-frontend-boundaries-linted.md) (accepted): Steiger checks the layer boundaries in CI, and a failure of its naming rule is fixed by renaming the module.
- [CLA-0044](${CLAUDE_PLUGIN_ROOT}/adr/0044-hypermedia-links-and-actions.md) (accepted): Representations carry links and the commands available now; the UI shows only those.
- [CLA-0045](${CLAUDE_PLUGIN_ROOT}/adr/0045-http-semantics-and-problem-details.md) (accepted): The API uses HTTP's own semantics: status codes, Problem Details and conditional writes.
- [CLA-0046](${CLAUDE_PLUGIN_ROOT}/adr/0046-openapi-document.md) (accepted): The OpenAPI document groups endpoints by module, and frontend API types are generated from it.
- [CLA-0060](${CLAUDE_PLUGIN_ROOT}/adr/0060-jobs-router-and-job-resource.md) (accepted): The UI starts jobs through module endpoints and follows them through the jobs router.
- [CLA-0053](${CLAUDE_PLUGIN_ROOT}/adr/0053-shadcn-ui-design-system.md) (accepted): shadcn/ui is the design system. Add components only through its CLI or MCP server into `shared/ui`, and compose them in screens instead of restyling them.
- [CLA-0054](${CLAUDE_PLUGIN_ROOT}/adr/0054-tailwind-and-design-tokens.md) (accepted): Tailwind CSS v4 utilities over design tokens defined as CSS variables in one theme file, with no raw colours, per-component CSS or inline styles.
- [CLA-0055](${CLAUDE_PLUGIN_ROOT}/adr/0055-claudalisk-registry-and-ai-tooling.md) (accepted): claudalisk ships an `@claudalisk` shadcn registry with its theme and base components. The plugin configures shadcn's MCP server and the scaffold adds its skill.
