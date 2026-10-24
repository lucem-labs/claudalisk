# CLA-0029: Two local environments: dev for the agent, prod for real data

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** guardrail hook (protected prod resources); deny list backstop; environment scripts

## Decision

- **dev** (`<app>.dev.localhost`) is the agent's environment. It is deployed freely and reset at will, and it shows a DEV badge.
- **prod** (`<app>.prod.localhost`) holds the owner's real data, which can't be recreated. Its data volume is external and created by the owner, so Compose can never delete it.
- The Compose files are `compose.base.yml` plus `compose.dev.yml` or `compose.prod.yml`. There is deliberately no `docker-compose.yml`.
- The agent never runs Compose commands against the prod project by hand, never writes SQL against prod, and never runs any of:
  - `docker compose down -v`
  - `docker volume rm` or `docker volume prune`
  - `docker system prune`
- Prod changes only through the deploy and restore scripts.
- A health endpoint reports `status`, `database`, `environment`, `deployedSha` and `deployedRef` (#12).

## Consequences

- The agent can experiment on dev without risk to real data.
