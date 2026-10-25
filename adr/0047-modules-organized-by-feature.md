# CLA-0047: A module's implementation is organized by feature folders

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0006), reviewer

## Context

The frontend groups code by what it does for the user, not by its technical kind (CLA-0036). The backend modules didn't. In the existing apps, one module splits its code into `Services/`, `Controllers/`, `Contracts/`, `Data/` and `Mapping/` folders, so one change touches four folders. Another grows "god services" split across partial files, one file per use case. In both cases each use case wants its own home.

The .NET name for this is vertical slice architecture. Inside a modular monolith, the module is the outer boundary (CLA-0001) and the slices sit inside it.

## Decision

- A module's implementation project, `<Root>.Modules.<Name>`, holds:
  - the module class, `<Name>Module.cs`;
  - `Features/`, one folder per feature;
  - `Shared/`, for code that two or more of the module's features use and that isn't a domain rule (CLA-0050).

  The aggregates live in the module's Domain project (CLA-0048), and persistence lives in its Persistence project (CLA-0007).
- **A feature is one use case**, named after it in the module's ubiquitous language (CLA-0041):
  - **A command** gets its own feature, named after the command, such as `Features/CancelOrder/` (CLA-0043).
  - **A query** gets its own feature, named after what it reads, such as `Features/GetOrderSummary/` (CLA-0042). Its handler may read through a read store that projects straight to the response, without loading the aggregate.
  - **Plain CRUD on one resource is one feature**, named after the resource, such as `Features/OrderNotes/`. That covers create, read, update and delete of attributes with no rules of their own. When one of those operations gains a domain rule, it moves out into its own command feature.
- **A feature folder holds the whole slice:**
  - one small controller, `<Feature>Controller`, with the feature's endpoint, or endpoints for a CRUD feature;
  - the request and response DTOs;
  - the request sent through the dispatcher, and its handler (CLA-0049);
  - the feature's mapping extension methods (CLA-0005);
  - its validation.
- **Tests mirror features.** A feature's tests live in a matching folder of the test project, such as `Modules/Orders/Features/CancelOrder/`.

```
<Root>.Modules.Orders/
  OrdersModule.cs
  Features/
    PlaceOrder/
      PlaceOrderController.cs
      PlaceOrderRequest.cs
      PlaceOrder.cs
      PlaceOrderHandler.cs
    CancelOrder/
    GetOrder/
    GetOrderSummary/
    OrderNotes/
  Shared/
```

## Consequences

- One use case is one folder. Adding, changing or deleting it touches that folder, plus the aggregate when a rule changes.
- Controllers stay thin (CLA-0005) because each one serves one feature, and no controller grows into a shared file every change has to edit.
- OpenAPI still groups endpoints by module, because the tag comes from the module's assembly, not from the controller (CLA-0046).
- Some code repeats across features until a second use moves it down (CLA-0050). That is the deliberate price of keeping features independent.
