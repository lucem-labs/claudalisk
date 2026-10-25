# CLA-0046: The OpenAPI document groups endpoints by module, and frontend API types are generated from it

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture test (every operation has its module's tag); CI (generated types are current)
- **Issue:** #21

## Decision

- The backend publishes an OpenAPI document with ASP.NET Core's built-in OpenAPI support. The document describes every resource, command, `_links` and `_actions` member, and Problem Details `type` (CLA-0044, CLA-0045).
- **Endpoints are grouped by module.**
  - Every operation is tagged with the name of the module that owns it, such as `Orders` for `<Root>.Modules.Orders`. The API reference UI, such as Swagger UI, shows one group for each module.
  - The tag comes from module registration (CLA-0004). A convention tags every controller in a module's assembly. Controllers do not set tags by hand.
  - The API project's own cross-cutting endpoints, such as health, have the tag `Host`.
  - Each tag has a description of what the bounded context covers (CLA-0041).
- **Frontend API types are generated from the document.**
  - The types go into `shared/api`, and the `api` segment of each entity uses them (CLA-0014, CLA-0037).
  - `openapi-typescript` generates them (CLA-0065). Nobody edits the generated file by hand.
  - CI regenerates the types and fails when they differ from the committed ones. A backend change that breaks the frontend then shows as a type error in the same pull request.

## Consequences

- The API reference reads like the module map: one group for each bounded context, matching the frontend's entity slices.
- The endpoints of a new module get the correct group without anyone remembering to tag them.
- The request and response DTOs in each feature folder (CLA-0047) are the one source of truth for the shape of the API.
- DTOs need accurate nullability and names, because the frontend sees them as they are.
