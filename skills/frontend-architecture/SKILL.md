---
name: frontend-architecture
description: Claudalisk frontend architecture decisions (ADRs). Covers Feature-Sliced Design layers and slices, pages first, entities that mirror backend modules, server state in TanStack Query, shared client state in Zustand stores, Steiger boundary checks, and consuming the API (hypermedia actions, Problem Details and generated API types). Use when writing, reviewing or restructuring frontend code, folders, imports or state in a claudalisk app.
paths:
  - "frontend/src/**"
  - "frontend/steiger.config.*"
user-invocable: false
---

# Frontend architecture

These are claudalisk's decisions for frontend structure and state. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0036](${CLAUDE_PLUGIN_ROOT}/adr/0036-feature-sliced-design-pages-first.md) (proposed): Feature-Sliced Design layers with downward-only imports and a public API per slice. Code starts in its page and moves down on its second use.
- [CLA-0037](${CLAUDE_PLUGIN_ROOT}/adr/0037-entities-mirror-backend-modules.md) (proposed): one entity slice per backend module, calling only that module's endpoints.
- [CLA-0038](${CLAUDE_PLUGIN_ROOT}/adr/0038-server-state-in-tanstack-query.md) (proposed): read and write API data only through TanStack Query hooks exported by entity `api` segments, and never fetch in `useEffect`.
- [CLA-0039](${CLAUDE_PLUGIN_ROOT}/adr/0039-client-state-in-zustand-stores.md) (proposed): shared client state lives in Zustand stores in a slice's `model` segment. Components subscribe through selectors and change state only through actions.
- [CLA-0040](${CLAUDE_PLUGIN_ROOT}/adr/0040-frontend-boundaries-linted.md) (proposed): Steiger checks the layer boundaries in CI.
- [CLA-0014](${CLAUDE_PLUGIN_ROOT}/adr/0014-frontend-stack-and-api-module.md) (accepted): every backend call goes through a typed API layer, with one client in `shared/api` and an `api` segment per entity.
- [CLA-0044](${CLAUDE_PLUGIN_ROOT}/adr/0044-hypermedia-links-and-actions.md) (proposed): representations carry HAL-style `_links` and the `_actions` the aggregate allows now, and the UI shows only those actions.
- [CLA-0045](${CLAUDE_PLUGIN_ROOT}/adr/0045-http-semantics-and-problem-details.md) (proposed): standard status codes, RFC 9457 Problem Details with a `type` per domain error, and ETag with If-Match on writes.
- [CLA-0046](${CLAUDE_PLUGIN_ROOT}/adr/0046-openapi-document.md) (proposed): the OpenAPI document groups endpoints by module through a registration convention. Frontend API types are generated from it and checked in CI.
- [CLA-0060](${CLAUDE_PLUGIN_ROOT}/adr/0060-jobs-router-and-job-resource.md) (proposed): module endpoints start jobs and return `202` with a link to `/api/jobs/{module}/{id}`; the jobs router serves a standard job representation with a `result` link to the resource the job changed.
