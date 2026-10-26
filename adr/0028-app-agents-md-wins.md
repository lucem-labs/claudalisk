# CLA-0028: The app's AGENTS.md wins, and deviations cite ADR ids

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** router (states it); reviewer

## Decision

- An app's own `AGENTS.md` overrides claudalisk defaults where they differ.
- `AGENTS.md` holds app facts only: domain, commands, URLs, ports, and a short uat data-safety paragraph.
- It has a "Deviations" section that lists each deliberate difference by ADR id, for example "Deviates from CLA-0009: a daily import job writes reference data, because …".
- `CLAUDE.md` is a one-line `@AGENTS.md` shim.
- Do not copy generic workflow, safety and architecture rules into the app. They live in these ADRs.

## Context

When an app copies generic rules into its `AGENTS.md`, the copies drift: a safety rule added later never reaches them, and shortened guides lose detail.

## Consequences

- Each rule has one home, and a deviation is visible and justified.
