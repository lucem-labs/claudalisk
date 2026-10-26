# CLA-0009: No data changes at startup

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** reviewer

## Context

When an app seeds fixtures at startup, the fixtures reappear after cleanups, sample rows mix with real data, and it becomes hard to answer "what changed the real data?".

## Decision

- The application never creates, changes or deletes data at startup. This means no seeding, no default rows, no implicit cleanups and no regeneration.
- Default rows come only from migrations, written idempotently (`INSERT … ON CONFLICT DO NOTHING`).
- Real data comes only from the database itself and its backups.
- Job workers and the scheduler are not startup writes. They run only work that was queued or that the owner scheduled (CLA-0058 and CLA-0061).

## Consequences

- Every change to real data comes from a migration, a queued or scheduled job, or a request to the app, so "what changed the real data?" always has an answer.
