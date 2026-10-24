# CLA-0012: One-off data fixes are reviewed, idempotent scripts

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** guardrail hook (ask before a one-off script runs by hand), reviewer
- **Issue:** #22

## Context

Data cleanups in an existing app were first done with SQL by hand. They were not reviewed, not backed up first, and not tried on dev.

## Decision

- A one-off data fix is a dated, idempotent script in `scripts/one-off/` that takes the target environment and prints what it changed.
- It runs on dev first. On prod it runs inside a deploy, after the pre-deploy backup and the migrations.
- Scripts marked owner-only in the app config are never run by the agent.

## Consequences

- Schema changes still go through migrations (CLA-0007); one-off scripts only fix data.
