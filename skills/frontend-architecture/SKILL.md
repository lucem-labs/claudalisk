---
name: frontend-architecture
description: Claudalisk frontend architecture decisions (ADRs) - Feature-Sliced Design layers and slices, pages first, entities that mirror backend modules, server state in TanStack Query, shared client state in Zustand stores, and Steiger boundary checks. Use when writing, reviewing or restructuring frontend code, folders, imports or state in a claudalisk app.
paths:
  - "frontend/src/**"
  - "frontend/steiger.config.*"
user-invocable: false
---

# Frontend architecture

These are claudalisk's decisions for how frontend code is structured and where its state lives. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0036](${CLAUDE_PLUGIN_ROOT}/adr/0036-feature-sliced-design-pages-first.md) (proposed): Feature-Sliced Design layers with downward-only imports and a public API per slice; code starts in its page and moves down on its second use.
- [CLA-0037](${CLAUDE_PLUGIN_ROOT}/adr/0037-entities-mirror-backend-modules.md) (proposed): one entity slice per backend module, calling only that module's endpoints.
- [CLA-0038](${CLAUDE_PLUGIN_ROOT}/adr/0038-server-state-in-tanstack-query.md) (proposed): API data is read and written only through TanStack Query hooks exported by entity `api` segments; no fetching in `useEffect`.
- [CLA-0039](${CLAUDE_PLUGIN_ROOT}/adr/0039-client-state-in-zustand-stores.md) (proposed): shared client state lives in Zustand stores in a slice's `model` segment; components subscribe through selectors and change it only through actions.
- [CLA-0040](${CLAUDE_PLUGIN_ROOT}/adr/0040-frontend-boundaries-linted.md) (proposed): Steiger checks the layer boundaries in CI.
- [CLA-0014](${CLAUDE_PLUGIN_ROOT}/adr/0014-frontend-stack-and-api-module.md) (accepted): every backend call goes through a typed API layer: one client in `shared/api` and an `api` segment per entity.
