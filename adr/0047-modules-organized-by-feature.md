# CLA-0047: A module is organized by feature folders, its dependencies go down, and code starts in its feature

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (features do not reference each other; `Shared` does not reference `Features`; DTOs live in a feature folder or the module's `Shared` namespace); reviewer (`Shared/` grouped by resource or concern)

## Context

Backend modules split by technical kind, into `Services/`, `Controllers/`, `Contracts/`, `Data/` and `Mapping/` folders, make one change touch four folders. "God services" split across partial files, one per use case, show the same need: each use case needs its own home. The .NET name for this is vertical slice architecture. In a modular monolith, the module is the outer boundary (CLA-0001), and the slices are inside it. It mirrors the frontend's pages-first rule (CLA-0036).

## Decision

- **A module's implementation project, `<Root>.Modules.<Name>`, holds:**
  - the module class, `<Name>Module.cs`;
  - `Features/`, with one folder for each feature;
  - `Shared/`, for code that two or more of the module's features use and that is not a domain rule, grouped by resource or concern, such as `Shared/Orders/`, never by kind such as `Shared/Dtos/`.

  The aggregates are in the Domain project (CLA-0048), and persistence is in the Persistence project (CLA-0007).
- **A feature is one use case**, named in the module's ubiquitous language (CLA-0041):
  - a command gets its own feature, named after it, such as `Features/CancelOrder/` (CLA-0043);
  - a query gets its own feature, named after what it reads, such as `Features/GetOrderSummary/`. What it loads follows CLA-0048;
  - plain CRUD on one resource's attributes with no rules is one feature, named after the resource, such as `Features/OrderNotes/`. An operation that gets a domain rule moves out into its own command feature.
- **A feature folder holds the whole slice:** one small controller (CLA-0005), the request DTO and the response DTOs only it returns, the command or query and its handler (CLA-0049, CLA-0052), the mapping (CLA-0069) and the validators (CLA-0057).
- **Dependencies go down.** Features use `Shared`, the Domain project and the store contracts. `Shared` uses the Domain project, the module's own Interfaces project, the read models of its store contracts and the packages the project references. Nothing references a feature, and features never reference each other. A shared mapping that needs a feature's type moves that type down first.
- **Domain rules start in the aggregate** (CLA-0048), even when one feature uses them.
- **All other code starts in the feature that needs it, and moves down on its second use:**
  - a helper or a response DTO moves to the module's `Shared/`, under its resource. An aggregate has one representation (CLA-0042), so every endpoint that returns it returns that one DTO;
  - code moves to `<Root>.Shared` only when a second module needs it and it has no business meaning. DTOs and messages never move there (CLA-0003, CLA-0005).
- **Only a module's contracts are public.** Everything in the implementation and Persistence projects is `internal`, except the module class, the controllers, which ASP.NET Core discovers only when public (CLA-0004), and what registration needs.
- **Tests mirror features** in the module's test project (CLA-0064).

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
    GetOrderSummary/
    OrderNotes/
  Shared/
    Orders/
      OrderResponse.cs
      OrderMapping.cs
```

## Consequences

- One use case is one folder. To add, change or delete it, touch that folder, plus the aggregate when a rule changes.
- A feature can change or go away without breaking another feature.
- Some code repeats across features until a second use moves it down. That is the price of independent features, and the move is a normal refactor in the change that adds the second use.
- Architecture tests check the rules by namespace: `Features.<A>` may not reference `Features.<B>`, and `Shared` and its sub-namespaces may not reference `Features`.
