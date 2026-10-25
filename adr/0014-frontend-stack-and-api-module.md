# CLA-0014: React, TypeScript and Vite, with every backend call through a typed API layer

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** frontend-conventions
- **Enforced by:** reviewer; lint rule (proposed in #21)
- **Issue:** #21

## Decision

- The frontend is React, TypeScript and Vite, with plain CSS.
- Every backend call goes through a typed API layer that holds the API types and the request helpers. Components never call `fetch` directly.
- The layer is one HTTP client in `shared/api` and an `api` segment in each entity slice (CLA-0036, CLA-0037). Components use it through TanStack Query hooks (CLA-0038).
- Proposed (#21): a lint rule that forbids `fetch` outside `shared/api`.

## Consequences

- API changes show up as type errors in the entity slice for that module.
- No API file grows to cover every module.
