# CLA-0068: Events fan out to every subscriber as a job after the commit

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the dispatching and jobs packages and their tests (CLA-0062); architecture tests (no event handler runs inside the publisher's unit of work); reviewer

## Context

An event can have several subscribers, in the publishing module and in others. If subscribers ran inside the publisher's transaction, a bug or a slow handler in one module would block or roll back a change in another. It would also stop working once a module moves to its own database or out of process (CLA-0001).

## Decision

- **Two kinds of event.**
  - A **domain event** is internal to a module. An aggregate records it while it changes, such as `OrderWasCanceled` from `order.Cancel()` (CLA-0048).
  - An **integration event** is a message in the module's Interfaces project, named in the past tense with no suffix, such as `OrderCanceled` (CLA-0052, CLA-0067). Other modules subscribe only to integration events.
- **Publishing happens in the unit of work, before the commit.** The unit-of-work step collects the domain events of every aggregate saved in it. It maps each one to its integration event, or to an internal event for handlers in the same module, and publishes it.
- **Publishing writes one job per subscriber.** For every handler of the event, in any module, the jobs library inserts a job row carrying the event into the jobs table of the handler's module (CLA-0058). The rows commit with the change or roll back with it.
- **No handler runs inside the publisher's transaction,** not even a handler in the same module. Each subscriber's worker runs its job after the commit, with its own unit of work, retries and failure (CLA-0058).
- **A module that subscribes to an event accepts background work,** so it has a jobs table.
- **Handlers are idempotent,** because a job can run more than once. They use the job id or the event id as the idempotency key.
- **Order is not guaranteed** across events when several workers run. A subscriber that needs order runs the event on one lane with one worker, or checks the aggregate's version.
- Subscriptions are registered at module registration. A module that subscribes to another module's event declares a dependency on its marker (CLA-0004).

## Consequences

- A failing or slow subscriber never blocks or rolls back the change that published the event.
- Delivery is guaranteed: an event reaches every subscriber exactly when its change commits.
- Reactions are eventually consistent, including inside one module. A read model that one module keeps for itself is updated shortly after the change, not with it.
- The jobs library writes into the subscribers' jobs tables. This is the same named exception to "nothing crosses a schema" as the jobs router (CLA-0007, CLA-0060).
- On SQS, the fan-out maps to one SNS topic per event with one SQS queue per subscriber.
