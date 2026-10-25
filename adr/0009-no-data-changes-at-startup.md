# CLA-0009: No data changes at startup

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** reviewer

## Context

An existing app seeded fixtures at startup. The fixtures reappeared after cleanups, sample rows mixed with real data, and "what changed the real data?" became hard to answer.

## Decision

- The application never creates, changes or deletes data at startup: no seeding, no default rows, no implicit cleanups or regeneration.
- Default rows come only from migrations, written idempotently (`INSERT … ON CONFLICT DO NOTHING`).
- Real data comes only from the database itself and its backups.

## Consequences

- An app that needs a startup or background job that writes data lists it as a deliberate deviation in its `AGENTS.md` (CLA-0028).
