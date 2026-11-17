# CLA-0014: The frontend is React, TypeScript and Vite, with React Router 7, oxlint, Vitest and a typed API client generated from OpenAPI

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** frontend
- **Enforced by:** the scaffold; oxlint's `no-restricted-globals` rule on `fetch` outside `src/shared/api`; CI (lint, unit tests, generated types); reviewer
- **Issue:** #21

## Decision

- **Stack:** React, TypeScript and Vite. Styling follows CLA-0053 and CLA-0054.
- **Routing:** React Router 7. Routes are defined in `app` (CLA-0036). View state that belongs in the URL uses its search parameters (CLA-0039).
- **Every backend call goes through a typed API layer.**
  - The layer is one HTTP client in `shared/api` and an `api` segment in each entity slice (CLA-0037).
  - The client is `openapi-fetch`, typed by the types that `openapi-typescript` generates from the backend's OpenAPI document into `shared/api` (CLA-0046).
  - Components use it through TanStack Query hooks (CLA-0038) and never call `fetch` directly. An oxlint rule forbids `fetch` outside `src/shared/api`, end-to-end tests and build config.
- **Linting:** oxlint, next to Steiger (CLA-0036). Both run in CI.
- **Unit tests:** Vitest, for the logic in `model` and `lib` segments, such as Zustand stores and helpers. A test sits next to its code as `*.test.ts`. UI behaviour is tested end to end with Playwright (CLA-0070).

## Consequences

- A backend change that breaks the frontend fails `tsc` on the generated types, in the entity slice for that module.
- No API file grows to cover every module.
- Store logic can be tested without a browser.
