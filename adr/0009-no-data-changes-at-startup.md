# CLA-0009: No data changes at startup

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** reviewer

## Context

An existing app seeded fixtures at startup. The fixtures reappeared after cleanups, sample rows mixed with real data, and it became hard to answer "what changed the real data?".

## Decision

- The application never creates, changes or deletes data at startup. This means no seeding, no default rows, no implicit cleanups and no regeneration.
- Default rows come only from migrations, written idempotently (`INSERT … ON CONFLICT DO NOTHING`).
- Real data comes only from the database itself and its backups.
- Job workers and the scheduler are not startup writes. They run only work that was queued or that the owner scheduled (the proposed CLA-0058 and CLA-0061).

## Consequences

- If an app needs a startup or background job that writes data, it lists the job as a deliberate deviation in its `AGENTS.md` (CLA-0028).
