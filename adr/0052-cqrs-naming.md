# CLA-0052: Commands, queries, events and their handlers follow fixed naming patterns

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (suffixes match the dispatcher's interfaces), reviewer

## Context

Every feature sends a command or a query through the dispatcher (CLA-0047, CLA-0049), so each feature adds several types with closely related names. A fixed pattern helps a reader or an agent find a feature's pieces by name alone.

## Decision

| Object | Pattern | Example |
|---|---|---|
| Command | imperative verb + noun + `Command` | `CancelOrderCommand` |
| Query for one item | `Get` + noun + `Query` | `GetOrderQuery`, `GetOrderSummaryQuery` |
| Query for a page of a collection | `List` + plural noun + `Query` | `ListOrdersQuery` |
| Query for a free-text search | `Search` + plural noun + `Query` | `SearchOrdersQuery` |
| Handler | the message's name, with `Command` or `Query` replaced by `Handler` | `CancelOrderHandler`, `GetOrderSummaryHandler` |
| Validator | the message's name + `Validator` | `CancelOrderCommandValidator` |
| Event or notification | noun + past-tense verb, no suffix | `OrderCanceled` |
| Event handler | the event's name + `Handler`, prefixed with what it does when there are several | `SendReceiptOnOrderCanceledHandler` |
| Feature folder and controller | the use case, no suffix (CLA-0047) | `Features/CancelOrder/`, `CancelOrderController` |
| HTTP DTOs | `<Feature>Request` and `<Thing>Response` | `CancelOrderRequest`, `OrderSummaryResponse` |
| Read model | the thing it describes, no suffix | `OrderSummary` |
| Aggregate command and guard | imperative verb; `Can` + verb (CLA-0048) | `order.Cancel(reason)`, `order.CanCancel` |
| Stores | `I<Aggregate>Store` for writes, `I<Aggregate>ReadStore` for reads | `IOrderStore`, `IOrderReadStore` |
| Asynchronous method | `Async` suffix | `SaveAsync` |

- The verb and noun come from the module's ubiquitous language (CLA-0041). The command's verb is the same word as the aggregate's method and the route's command sub-resource (CLA-0043): `CancelOrderCommand`, `order.Cancel()` and `POST /api/orders/{id}/cancel`.
- Messages in a module's Interfaces project follow the same patterns (CLA-0003).
- **Identifiers are in US English**, like .NET's own types, such as `OperationCanceledException`: `OrderCanceled`, not `OrderCancelled`. Prose in docs and ADRs stays in British English.

## Consequences

- The suffix stops a command or query from having the same name as its feature's namespace (`Features.CancelOrder`), which C# handles badly.
- An architecture test can check three rules. Every type that implements the dispatcher's command interface ends in `Command`. Every query ends in `Query`. Every handler ends in `Handler`.
- A search for a use case's name finds its folder, controller, command, handler, validator and tests together.
