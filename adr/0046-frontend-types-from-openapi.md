# CLA-0046: Frontend API types are generated from the backend's OpenAPI document

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** CI
- **Issue:** #21

## Decision

- The backend publishes an OpenAPI document with ASP.NET Core's built-in OpenAPI support. It describes every resource, command, `_links` and `_actions` member, and Problem Details `type` (CLA-0044, CLA-0045).
- The frontend's API types are generated from that document into `shared/api` and used by each entity's `api` segment (CLA-0014, CLA-0037). The generated file is never edited by hand.
- CI regenerates the types and fails when they differ from the committed ones, so a backend change that breaks the frontend shows up as a type error in the same pull request.

## Consequences

- The DTOs in a module's `Dtos` folder (CLA-0005) are the one source of truth for the API's shape.
- Hand-written API types and their drift between backend and frontend go away.
- DTOs need accurate nullability and names, because the frontend sees them as they are.
