# CLA-0029: Two local environments: dev for the agent, uat for the owner's real data

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** guardrail hook (protected uat resources, #2); deny-list backstop; the environment scripts

## Context

The two environments were first called dev and prod. The second one is not production. The owner uses the app there with real, hand-curated data and reviews each change before merging it. The name **uat** says this, and it lets deploys drop the heavyweight production guards (CLA-0030). The data still matters and cannot be recreated, so the data protections stay.

## Decision

- **dev** (`<app>.dev.localhost`) is the **agent's** environment.
  - The agent deploys, resets and refreshes it freely, by hand. Nothing else deploys it (CLA-0030).
  - It shows a DEV badge.
- **uat** (`<app>.uat.localhost`) is the **owner's** environment. It holds real, hand-curated data that cannot be recreated.
  - Its data volume is external and the owner creates it, so Compose can never delete it.
  - It changes only through the guarded review deploy (CLA-0030). The agent never runs Compose commands against it, restarts or reconfigures it by hand.
  - Its data changes only through the app (used by the owner), through migrations that the review deploy applies (CLA-0012), and through the owner's restores (CLA-0031). The agent never writes SQL against uat and never restores it. The only script the agent may run against uat data is the read-only backup (CLA-0031).
  - It shows a UAT badge.
- **Compose files.** The files are `compose.base.yml` plus `compose.dev.yml` or `compose.uat.yml`. There is deliberately no `docker-compose.yml`.
- **Never, on uat.** The agent never runs Compose commands against the uat project by hand. Neither the agent nor any script runs any of these against uat resources:
  - `docker compose down -v`
  - `docker volume rm` or `docker volume prune`
  - `docker system prune`
- **Health endpoint.** It reports `status`, `database`, `environment`, `deployedSha` and `deployedRef`, so the router and the owner can see which commit each environment runs (#12).

## Consequences

- The agent can experiment on dev without risk to real data.
- Everything that reaches uat is reviewed, versioned and backed up first.
