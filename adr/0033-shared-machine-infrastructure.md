# CLA-0033: The proxy and CI runners are shared by every app on the machine

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** guardrail hook (protected resources from a machine-wide registry, proposed in #8)
- **Issue:** #8, #19, #20

## Decision

- **Proxy.** One Traefik stack, owned by the plugin, serves every app at `<app>.dev.localhost` and `<app>.prod.localhost`.
  - Apps attach by Compose labels and carry no proxy files.
  - Deploys start the proxy only if it isn't running.
  - Traefik is pinned to v3.6.1 or later, which Docker Engine 29 needs.
- **CI runners.** Ephemeral containerised runners run on the owner's machine, and apps carry only a runner label. They refuse public repositories, because a pull request from anyone would otherwise run code on the owner's machine.
- An app never stops, restarts or reconfigures the proxy or the runners. It never touches another app's containers, projects or volumes, because another app's prod depends on them.

## Consequences

- Several apps run side by side on one machine without interfering.
