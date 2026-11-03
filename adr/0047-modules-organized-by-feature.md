# CLA-0047: A module's implementation is organized by feature folders

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (features do not reference each other; DTOs live only in a feature or `Dtos`), reviewer

## Context

The frontend groups code by what it does for the user, not by its technical kind (CLA-0036). Backend modules split by technical kind, into `Services/`, `Controllers/`, `Contracts/`, `Data/` and `Mapping/` folders, make one change touch four folders. "God services" split across partial files, one file per use case, show the same need: each use case needs its own home.

The .NET name for this is vertical slice architecture. In a modular monolith, the module is the outer boundary (CLA-0001) and the slices are inside it.

## Decision

- A module's implementation project, `<Root>.Modules.<Name>`, holds:
  - the module class, `<Name>Module.cs`
  - `Features/`, with one folder for each feature
  - `Dtos/`, once a second feature needs it, for the response DTOs that two or more of the module's features return, with their mapping (CLA-0050)
  - `Shared/`, once a second feature needs it, for other code that two or more of the module's features use and that is not a domain rule (CLA-0050). It never holds DTOs.

  The aggregates are in the module's Domain project (CLA-0048). Persistence is in its Persistence project (CLA-0007).
- **DTOs that features share.** A response DTO that two or more of the module's features return lives in `Dtos/`, with its mapping. A request DTO always stays in its feature. `Dtos/` can have sub-folders, such as `Dtos/Runs/`. A module's `Dtos/` belongs to it alone: another module never uses its DTOs (CLA-0005).
- **A started job.** The module defines its own response DTO for an endpoint that starts a job (CLA-0060), mapped from `JobReference` (CLA-0067). It lives in the one feature that returns it, or in `Dtos/` once several do. It never comes from a claudalisk package or another module. It takes a schema name of its own, such as `OrderingJobStartedResponse`, distinct from other modules' and from the jobs library's job resource (CLA-0046).
- **A feature is one use case**, named after it in the module's ubiquitous language (CLA-0041):
  - **A command** gets its own feature, named after the command, such as `Features/CancelOrder/` (CLA-0043).
  - **A query** gets its own feature, named after what it reads, such as `Features/GetOrderSummary/` (CLA-0042). A query for an aggregate or a page of a collection loads the aggregates, so that each item has its `version` and `_actions` (CLA-0044, CLA-0056). A page of a collection may instead read through a read store when the aggregate's answer to which commands it allows is a pure function of its state (CLA-0048), and each row holds the version and everything that function needs. The page's mapping then calls that function for each row. A query for a read model reads through a read store that projects straight to the response.
  - **Plain CRUD on one resource is one feature**, named after the resource, such as `Features/OrderNotes/`. This covers create, read, update and delete of attributes that have no rules of their own. When one of these operations gets a domain rule, it moves out into its own command feature.
- **A feature folder holds the whole slice:**
  - one small controller, `<Feature>Controller`, with the feature's endpoint (or the endpoints, for a CRUD feature)
  - the HTTP request DTO, and the response DTOs that only this feature returns
  - the command or query that goes through the dispatcher, and its handler (CLA-0049), named as in CLA-0052
  - the feature's mapping extension methods (CLA-0005)
  - the validators of its commands and queries (CLA-0057)
- **Tests mirror features.** The tests of a feature are in a matching folder of the module's test project (CLA-0064), such as `Features/CancelOrder/` in `<Root>.Modules.Ordering.Tests`.

```
<Root>.Modules.Ordering/
  OrderingModule.cs
  Features/
    PlaceOrder/
      PlaceOrderController.cs
      PlaceOrderRequest.cs
      PlaceOrderCommand.cs
      PlaceOrderHandler.cs
    CancelOrder/
    GetOrder/
    GetOrderSummary/
    OrderNotes/
  Dtos/
  Shared/
```

## Consequences

- One use case is one folder. To add, change or delete it, touch that folder, plus the aggregate when a rule changes.
- Controllers stay thin (CLA-0005) because each one serves one feature. No controller grows into a shared file that every change must edit.
- OpenAPI still groups endpoints by module, because the tag comes from the module's assembly, not from the controller (CLA-0046).
- Some code repeats across features until a second use moves it down (CLA-0050). This is the deliberate price of independent features.
