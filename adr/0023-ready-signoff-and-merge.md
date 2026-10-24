# CLA-0023: Ready means CI green and verified; the owner signs off on prod

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** merge check (planned, #4); guardrail hook

## Decision

- A pull request stays a draft while work continues.
- It is marked ready only when CI is green on its head and the change is verified on dev.
- Then the head is deployed to prod (the sign-off deploy, CLA-0030). Only one pull request is on prod at a time.
- The pull request merges only after the owner signs off.
- After the merge, `main` is deployed to prod.

## Consequences

- The owner always reviews the exact commit that will merge, running on real data.
