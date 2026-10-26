# CLA-0037: Frontend entities mirror backend modules

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer

## Decision

- Each backend module the frontend uses has one entity slice, named after the module in kebab-case: `<Root>.Modules.OrderHistory` becomes `entities/order-history`.
- An entity's `api` segment calls only that module's endpoints, and its types match that module's DTOs.
- A page, widget or feature combines data from several modules. An entity never does. An entity that only references another entity's data uses `@x` (CLA-0036).
- An entity has no slice for a backend module the frontend never calls.

## Consequences

- The frontend's boundaries follow the backend's (CLA-0001). A change to one module's API touches one entity slice.
- A frontend that needs data from several modules shows that need in a higher layer, not inside an entity.
- When a backend module is split or renamed, its entity slice is split or renamed with it.
