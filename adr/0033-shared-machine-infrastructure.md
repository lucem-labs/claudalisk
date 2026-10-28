# CLA-0033: The proxy and CI runners are shared by every app on the machine

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** guardrail hook (protected resources from a machine-wide registry, planned in #8)
- **Issue:** #8, #19, #20

## Decision

- **Proxy.** One Traefik stack, owned by the plugin, serves every app at `<app>.dev.localhost` and `<app>.uat.localhost`.
  - Apps attach by Compose labels and carry no proxy files.
  - Deploys start the proxy only if it is not running.
  - Traefik is pinned to v3.6.1 or later, which Docker Engine 29 needs.
- **CI runners.** Ephemeral containerised runners (Docker-in-Docker) run on the owner's machine. Apps carry only a runner label (`ci`). The runners refuse public repositories, because a pull request from anyone would run code on the owner's machine.
- **Deploy runner.** One more runner, with the `deploy` label, mounts the host's Docker socket so CD can deploy dev and uat (CLA-0030).
  - It runs only CD jobs, which `workflow_run`, `pull_request_target` and pushes to `main` start. All of them use the workflow file from the default branch, never a pull request's own copy (CLA-0030).
  - It refuses public repositories, like the CI runners.
  - The guardrail hook protects it like the proxy.
- An app never stops, restarts or reconfigures the proxy or the runners. It never touches the containers, projects or volumes of another app, because the uat of that app depends on them.

## Consequences

- Several apps run side by side on one machine without interfering.
