# CLA-0065: The frontend uses React Router 7, oxlint, Vitest and generated OpenAPI types

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** the scaffold; CI (lint, unit tests, generated types)

## Decision

- **Routing:** React Router 7. Routes are defined in `app` (CLA-0036). View state that belongs in the URL uses its search parameters (CLA-0039).
- **Linting:** oxlint, next to Steiger (CLA-0040). Both run in CI.
- **Unit tests:** Vitest, for the logic in `model` and `lib` segments, such as Zustand stores and helpers. A test sits next to its code as `*.test.ts`. UI behaviour is tested end to end with Playwright (CLA-0016).
- **API types and client:** `openapi-typescript` generates the types from the backend's OpenAPI document into `shared/api` (CLA-0046). The `shared/api` client is `openapi-fetch`, typed by those types (CLA-0014).

## Consequences

- Store logic can be tested without a browser.
- A backend change that breaks the frontend fails `tsc` on the generated types.
