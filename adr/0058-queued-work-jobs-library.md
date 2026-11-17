# CLA-0058: Queued work runs as jobs through the claudalisk jobs library, with a swappable transport

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the jobs library and its tests (a `DomainException` fails a job after one attempt with its problem type and title, lucem-labs/claudalisk-dotnet#13); architecture tests (only modules that accept background work have a jobs table; no module references another module's jobs); API tests (a queued job stores its normalised plan); reviewer
- **Issue:** #79

## Context

Several ADRs rely on queued work (CLA-0001, CLA-0007, CLA-0043). A hand-written jobs table can have claiming workers, heartbeats, progress and cancel requests, and still lack retries and queue jobs outside the unit of work. The apps run on PostgreSQL today, but a production deployment may use an AWS queue.

## Decision

- **A job is a command that runs later.** It is a command (CLA-0052) with one handler, sent through the dispatcher's pipeline (CLA-0049) by a worker instead of a controller.
- **Work that can outlast a request is queued.** Work that calls a third-party API more than once, or can run longer than a request, never runs inside the request. Its command returns a `JobReference` (CLA-0003), its endpoint answers `202` with the job's link (CLA-0060), and it runs as a batch job (CLA-0059).
- **A job stores its normalised plan.** The handler that queues it normalises the input and stores the plan, not the raw request: defaults filled in, ids deduplicated, a random seed chosen. A rerun reproduces the run, and a list of runs shows what really ran.
- **The code is the claudalisk jobs library** (CLA-0062). Apps do not write their own queueing.
- **A jobs table only where it is needed.** A module that accepts background work, or subscribes to an event (CLA-0068), says so in its registration (CLA-0004). It then has a `jobs` table in its own schema and a worker.
- **The transport is swappable.** The jobs table always holds each job's command, status, attempts, progress, checkpoint, cancel request, result link and last error. A transport only moves jobs from the table to a worker:
  - **PostgreSQL** (now): the table is the queue. Workers claim with `FOR UPDATE SKIP LOCKED`, woken by `LISTEN`/`NOTIFY`, with polling as a fallback.
  - **AWS SQS** (later): the table is the outbox. A relay publishes committed rows, and the consumer updates the job's row.
- **Queueing joins the caller's transaction.** The job row is inserted on the scope's shared connection, inside the current unit of work (CLA-0007), so no job runs for a rolled-back change.
- **The queue stays behind the module's contract.** Only a module queues its own jobs, and another module asks for one through its contract (CLA-0003).
- **A worker runs each job in a fresh DI scope.**
  - A claim is a short transaction that sets `running`, increments `attempts` and stamps the heartbeat.
  - The unit of work that runs the handler also marks the job `succeeded`, so the handler's writes and the completion commit together. Batch jobs commit per batch (CLA-0059).
  - On an exception, the unit of work rolls back. A separate transaction records the error and requeues the job with exponential backoff and jitter. After the last attempt, 5 by default, the job stays `failed`.
  - A validation failure (CLA-0057) or a `DomainException` (CLA-0063) fails the job at once, keeping its problem type and title. A `DependencyUnavailableException` is retried no sooner than the wait it carries. Every other exception is retried.
  - A heartbeat on its own connection, every 15 seconds by default, keeps a job claimed. A running job whose heartbeat is older than 2 minutes goes back in the queue.
  - Cancel requests reach the handler through its cancellation token. Progress is written on its own connection, so the UI sees it before the job commits.
  - A dedupe key replaces older queued jobs with that key. On shutdown, a running job is requeued.
- **Handlers use the job id as the idempotency key** for side effects outside the database, such as HTTP requests or emails.
- **A succeeded job stores its result link** (CLA-0060).
- **Workers run only queued work,** so a worker is not a startup write (CLA-0009). End-to-end runs can turn workers off or run jobs inline.

## Consequences

- Queueing has one implementation with one set of tests, in the library.
- A move from PostgreSQL to SQS changes the transport registration, not the modules. A module that moves to its own database takes its jobs table with it.
- A job that only writes to its database takes effect exactly once. A job with external side effects can run more than once and must tolerate that.
