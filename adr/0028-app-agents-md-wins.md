# CLA-0028: The app's AGENTS.md wins, and deviations cite ADR ids

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** router (states it); reviewer

## Decision

- An app's own `AGENTS.md` overrides claudalisk defaults where they differ.
- `AGENTS.md` holds app facts only: domain, commands, URLs, ports, and a short uat data-safety paragraph.
- It has a "Deviations" section listing each deliberate difference by ADR id, for example "Deviates from CLA-0009: a daily import job writes reference data, because …".
- `CLAUDE.md` is a one-line `@AGENTS.md` shim.
- Generic workflow, safety and architecture rules are not copied into the app. They live in these ADRs.

## Context

When generic rules were copied into a second app's `AGENTS.md`, a safety rule added after an incident was lost. The testing guide also shrank from 178 to 17 lines.

## Consequences

- Each rule has one home, and a deviation is visible and justified.
