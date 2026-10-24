# CLA-0014: React, TypeScript and Vite, with one typed API module

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** frontend-conventions
- **Enforced by:** reviewer; lint rule (proposed in #21)
- **Issue:** #21

## Decision

- The frontend is React, TypeScript and Vite, with plain CSS.
- Every backend call goes through one typed API module (`frontend/src/api.ts`), which holds the API types and the fetch helpers. Components never call `fetch` directly.
- Proposed (#21): a lint rule that forbids `fetch` outside the API module, and a `pages/`, `components/`, `lib/` folder structure.

## Consequences

- API changes show up as type errors in one place.
