# CLA-0068: Events fan out to every subscriber as a job after the commit

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the dispatching and jobs packages and their tests (CLA-0062); architecture tests (no event handler runs inside the publisher's unit of work; module dependencies stay acyclic); reviewer
- **Issue:** #80

## Context

An event can have several subscribers, in the publishing module and in others. If subscribers ran inside the publisher's transaction, a bug or a slow handler in one module would block or roll back a change in another. It would also stop working once a module moves to its own database or out of process (CLA-0001).

An event's content and contract need rules of their own. The aggregate that records an event knows only its own change, so it cannot compute a total that spans other aggregates. Deliveries can arrive more than once and in any order. A subscriber can also be a module that the publisher already depends on, and the publisher's Interfaces project would then make the dependencies cycle. A read model that another module feeds needs today's state as its starting point, and that state lives in the other module's schema.

## Decision

- **Two kinds of event.**
  - A **domain event** is internal to a module. An aggregate records it while it changes, such as `OrderWasCanceled` from `order.Cancel()` (CLA-0048).
  - An **integration event** is a message in an Interfaces project, named in the past tense with no suffix, such as `OrderCanceled` (CLA-0052, CLA-0067). Other modules subscribe only to integration events.
- **The integration event lives in the publisher's Interfaces project,** unless that would make the module dependencies cycle. When the subscriber is already a dependency of the publisher, the subscriber owns the event type in its own Interfaces project as an inbound contract, and the publisher maps its domain event to it. The dependencies stay acyclic, and a rule such as "B must not depend on A" can still be checked (CLA-0004).
- **An integration event carries facts.** It has no library event id. It carries what happened, such as a delta, never a total that the publisher cannot compute. It also carries the aggregate's id and its version after the change, so a delivery can be compared with a snapshot. It carries state only together with a version that orders it, and a subscriber then ignores a state older than the one it has.
- **Publishing happens in the unit of work, before the commit.** The unit-of-work step collects the domain events of every aggregate saved in it. It maps each one to its integration event, or to an internal event for handlers in the same module, and publishes it.
- **Publishing writes one job per subscriber.** For every handler of the event, in any module, the jobs library inserts a job row carrying the event into the jobs table of the handler's module (CLA-0058). The rows commit with the change or roll back with it.
- **No handler runs inside the publisher's transaction,** not even a handler in the same module. Each subscriber's worker runs its job after the commit, with its own unit of work, retries and failure (CLA-0058).
- **A module that subscribes to an event accepts background work,** so it has a jobs table.
- **A delivery applies once.** The library keeps no record of handled ids. It completes the job in the same unit of work as the subscriber's writes, and only while the row is `running` on the attempt this run claimed. A run that no longer owns its row rolls back, so the same delivery cannot apply twice. Duplicate facts from a publisher are the app's concern. For side effects outside the database, a handler uses the job id as the idempotency key (CLA-0058).
- **Order is not guaranteed** across events when several workers run. A subscriber that needs order runs the event on one lane with one worker, or checks the aggregate's version.
- **A read model that another module feeds is seeded and recomputed by a rebuild job,** never by a migration that reads the other module's schema (CLA-0012).
  - The job reads the other module's state through a contract. Normally that is a query in the publisher's Interfaces project. When the subscriber owns the event as an inbound contract, it also owns an inbound snapshot query, and the publisher handles it, so the dependencies still do not cycle.
  - The snapshot carries what it includes, read in the same transaction as the state, such as the aggregate versions it covers. The rebuild turns that into a predicate over a delivery's payload, marks the active deliveries the predicate includes as succeeded, and leaves the others to apply. It runs on the same single-worker lane as the event's handler, so the two never run at once. Run twice, it gives the same read model (lucem-labs/claudalisk-dotnet#14).
  - The read model starts as not seeded and stays so until a rebuild has succeeded. The API reports that state instead of showing the read model as empty. A rebuild that fails leaves it not seeded and stays a failed job that the jobs resource shows (CLA-0060), and the module's rebuild command queues it again.
  - A rebuild whose source is missing fails, and never marks the read model as seeded. An empty source seeds an empty read model.
- Subscriptions are registered at module registration. A module that subscribes to another module's event declares a dependency on its marker (CLA-0004). A module that owns an inbound event or snapshot query declares none, because the publisher already depends on it.

## Consequences

- A failing or slow subscriber never blocks or rolls back the change that published the event.
- Delivery is guaranteed: an event reaches every subscriber exactly when its change commits.
- Reactions are eventually consistent, including inside one module. A read model that one module keeps for itself is updated shortly after the change, not with it.
- A subscriber never needs the publisher's totals. It adds up the facts it receives, and the completion guard keeps a redelivered job from counting twice.
- A read model can always be thrown away and rebuilt from the other module's contract.
- The jobs library writes into the subscribers' jobs tables. This is the jobs library's other exception to "nothing crosses a schema", beside the jobs router (CLA-0007, CLA-0060). It is allowed because only the library writes these rows, in its fixed shape, inside the publisher's unit of work. No module code writes another module's jobs table.
- On SQS, the fan-out maps to one SNS topic per event with one SQS queue per subscriber.
