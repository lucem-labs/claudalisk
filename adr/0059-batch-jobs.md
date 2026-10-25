# CLA-0059: Long jobs are batch jobs that the library commits one batch at a time

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the jobs library and its tests; reviewer

## Context

A normal job runs in one unit of work (CLA-0058). A long job would then hold one long transaction, with long locks and table bloat. The job must manage its own batches instead of splitting into many messages.

## Decision

- **A long job is a batch job.** Its handler implements the library's batch-job type, such as `IBatchJobHandler<TCommand, TCheckpoint>`, instead of a normal command handler. It has two parts:
  - one that returns the next batch from a checkpoint;
  - one that processes a batch.
- **The library drives the batches.** For each batch, it opens a unit of work (`IUnitOfWork.RunAsync`, CLA-0007). In that unit of work it processes the batch and saves the new checkpoint on the job's row. The writes and the checkpoint commit together.
- **The pipeline does not wrap a batch job in one unit of work** (CLA-0049). Logging and validation still run once for the whole job.
- **A retry resumes from the last checkpoint.** If the process stops after batch 7, the retry starts at batch 8. A batch job is idempotent through its checkpoint.
- **The last batch marks the job `succeeded`** and sets its result link (CLA-0058).
- **Progress and cancel work between batches.** The library reports progress after each batch, and checks for a cancel request before the next one.
- All other unit-of-work rules still apply inside each batch: one shared connection, nested calls join it, and an exception rolls back the current batch.

## Consequences

- There is no conflict with the unit of work. Each batch is a normal unit of work, and only the job as a whole is not atomic.
- Earlier batches stay committed when a later batch fails. The job's handler must accept a partly finished state.
- A handler cannot open its own transactions, so the batch-job type is the only way to commit part of a job.
