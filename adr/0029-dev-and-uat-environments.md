# CLA-0029: Two local environments: dev for the agent, uat for the owner's real data

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** guardrail hook (protected uat resources, #2); deny-list backstop; CD and the environment scripts

## Context

The two environments were first called dev and prod. In practice the second one isn't production. It is where the owner uses the app with real, hand-curated data and reviews each change before merging it. Calling it **uat** says that, and lets deploys drop the heavyweight production guards (CLA-0030). Its data still matters and can't be recreated, so the data protections stay.

## Decision

- **dev** (`<app>.dev.localhost`) is the **agent's** environment.
  - The agent deploys, resets and refreshes it freely, by hand or through CD.
  - It shows a DEV badge.
- **uat** (`<app>.uat.localhost`) is the **owner's** environment. It holds real, hand-curated data that can't be recreated.
  - Its data volume is external and created by the owner, so Compose can never delete it.
  - It changes only through CD (CLA-0030). The agent never deploys, restarts or reconfigures it by hand.
  - Its data changes only through the app, used by the owner, and through migrations deployed by CD (CLA-0012). The agent never writes SQL against uat, never runs scripts against its data, and never restores it.
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
