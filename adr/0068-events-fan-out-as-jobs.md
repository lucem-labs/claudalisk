# CLA-0068: Events fan out to every subscriber as a job after the commit

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the dispatching and jobs packages and their tests (CLA-0062); architecture tests (no event handler runs inside the publisher's unit of work; module dependencies stay acyclic); reviewer
- **Issue:** #80

## Context

An event can have several subscribers, in the publishing module and in others. If subscribers ran inside the publisher's transaction, a bug or a slow handler in one module would block or roll back a change in another, and that would stop working once a module moves out (CLA-0001). An event's contract also needs rules: the aggregate knows only its own change, deliveries can repeat and arrive in any order, a subscriber can be a module the publisher already depends on, and a read model fed by another module needs that module's current state to start from.

## Decision

- **Two kinds of event.**
  - A **domain event** is internal to a module. An aggregate records it while it changes, such as `OrderWasCanceled` from `order.Cancel()` (CLA-0048).
  - An **integration event** is a message in an Interfaces project, named in the past tense with no suffix, such as `OrderCanceled` (CLA-0003, CLA-0052). Other modules subscribe only to integration events.
- **The integration event lives in the publisher's Interfaces project,** unless that would make the module dependencies cycle. When the subscriber is already a dependency of the publisher, the subscriber owns the event type as an inbound contract, and the publisher maps its domain event to it.
- **An integration event carries facts.**
  - It carries what happened, such as a delta, never a total that the publisher cannot compute.
  - It carries the aggregate's id and its version after the change. It carries state only together with that version, and a subscriber ignores a state older than the one it has.
- **Publishing happens in the unit of work, before the commit.** The unit-of-work step collects the domain events of every aggregate saved in it, and maps each one to its integration event, or to an internal event for handlers in the same module.
- **Publishing writes one job per subscriber** into the jobs table of the handler's module (CLA-0058). The rows commit or roll back with the change.
- **No handler runs inside the publisher's transaction,** not even one in the same module. Each subscriber's worker runs its job after the commit, with its own unit of work, retries and failure. A module that subscribes has a jobs table.
- **A delivery applies once.** The library completes the job in the same unit of work as the subscriber's writes, and only while the row is `running` on the attempt this run claimed. Duplicate facts from a publisher are the app's concern. For side effects outside the database, the handler uses the job id as the idempotency key.
- **Order is not guaranteed** across workers. A subscriber that needs it uses one lane with one worker, or checks the version.
- **A read model that another module feeds is seeded and recomputed by a rebuild job,** never by a migration that reads the other module's schema (CLA-0012).
  - The job reads the other module's state through a contract: a query in the publisher's Interfaces project, or an inbound snapshot query when the subscriber owns the event.
  - The snapshot says what it covers, such as the aggregate versions it read. The rebuild runs on the event handler's lane, so the two never run at once, and deliveries the snapshot already covers are not applied again. Run twice, it gives the same read model (lucem-labs/claudalisk-dotnet#14).
  - The read model stays not seeded until a rebuild succeeds, and the API reports that state instead of an empty read model. A rebuild whose source is missing fails. An empty source seeds an empty read model.
- **Subscriptions are registered at module registration.** A subscriber declares a dependency on the publisher's marker (CLA-0004). A module that owns an inbound event or snapshot query declares none, because the publisher already depends on it.

## Consequences

- A failing or slow subscriber never blocks or rolls back the publisher's change.
- An event reaches every subscriber exactly when its change commits. Reactions are eventually consistent, even inside one module.
- A read model can always be thrown away and rebuilt from the other module's contract.
- The jobs library writes into the subscribers' jobs tables. This is its second exception to "nothing crosses a schema", beside the jobs router (CLA-0060). Only the library writes these rows, in its fixed shape, inside the publisher's unit of work.
- On SQS, the fan-out maps to an SNS topic per event and an SQS queue per subscriber.
