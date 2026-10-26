# CLA-0058: Queued work runs as jobs through the claudalisk jobs library, with a swappable transport

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the jobs library and its tests; architecture tests (only modules that accept background work have a jobs table; no module references another module's jobs); reviewer

## Context

Several ADRs rely on queued work (CLA-0001, CLA-0007, CLA-0043, CLA-0045), but none decided how it works. One existing app has a jobs table that workers claim with `FOR UPDATE SKIP LOCKED`, woken by `NOTIFY`, with lanes, heartbeats, progress, cancel requests and a dedupe key. It has no retries, and it queues jobs on its own connection, outside the unit of work. The apps run on PostgreSQL today, but a production deployment may use an AWS queue.

## Decision

- **A job is a command that runs later.** It is a command (CLA-0052) with one handler, sent through the dispatcher's pipeline (CLA-0049) by a worker instead of by a controller.
- **The code is the claudalisk jobs library** (CLA-0062). Apps do not write their own queueing.
- **A jobs table only where it is needed.** A module that accepts background work, or subscribes to an event (CLA-0068), says so in its module registration (CLA-0004). It then has a `jobs` table in its own schema (CLA-0007), created by its migrations, and a worker. A module without background work has no jobs table.
- **The transport is swappable.** The jobs table always holds each job's status, attempts, progress, checkpoint, result link and last error. A transport only moves jobs from the table to a worker:
  - **PostgreSQL** (now): the jobs table is the queue. Workers claim a job with `FOR UPDATE SKIP LOCKED`, and `LISTEN`/`NOTIFY` wakes them, with polling as a fallback.
  - **AWS SQS** (later): the jobs table is the outbox. A relay publishes committed rows to SQS, and the consumer updates the job's row.
- **Queueing joins the caller's transaction.** The job row is inserted on the scope's shared connection, inside the current unit of work. It commits or rolls back with the data that queued it, so no job runs for a rolled-back change.
- **The queue stays behind the module's contract.** Another module asks for background work by sending a command from the target module's Interfaces project, whose result is a `JobReference` (CLA-0067). Only the target module queues its own jobs. The calling module never sees the jobs library.
- **A worker runs each job in a fresh DI scope.**
  - A claim is a short transaction of its own. It sets the job to `running`, increments `attempts` and stamps the heartbeat.
  - The worker sends the command through the pipeline. The unit of work that runs the handler also marks the job `succeeded`, so the handler's writes and the job's completion commit together. Batch jobs commit per batch instead (CLA-0059).
  - On an exception, the unit of work rolls back. A separate transaction records the error and puts the job back in the queue with exponential backoff and jitter. After the last attempt (5 by default) the job stays `failed`. A validation failure (CLA-0057) fails the job at once.
  - A heartbeat runs on its own connection every 15 seconds by default. A running job whose heartbeat is older than 2 minutes goes back in the queue.
  - A cancel request reaches the handler through its cancellation token. Progress is written on its own connection, so the UI sees it before the job commits.
  - A dedupe key replaces older queued jobs with the same key.
  - On shutdown, a running job is cancelled and goes back in the queue.
- **Handlers are idempotent for side effects outside the database.** They use the job id as the idempotency key for calls such as HTTP requests or emails.
- **The job stores its result link.** When the job finishes, its handler sets the URL of the resource it created or changed, for the UI to follow (CLA-0060).
- **Workers run only queued work.** A worker is not a startup write (CLA-0009). End-to-end runs can turn workers off or run jobs inline.

## Consequences

- Queueing has one implementation with one set of tests, in the library.
- A move from PostgreSQL to SQS changes the transport registration, not the modules.
- A module that moves to its own database takes its jobs table with it.
- A job that only writes to its database takes effect exactly once. A job with external side effects can run more than once and must tolerate that.
