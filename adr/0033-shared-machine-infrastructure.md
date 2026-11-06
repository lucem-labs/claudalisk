# CLA-0033: The proxy and CI runners are shared by every app on the machine

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** guardrail hook (protected resources from the machine-wide registry of CLA-0082, CLA-0083; an ask before `tools/proxy.mjs recreate`), tests (`tools/proxy.test.mjs`, which checks the pin and fixed names of `proxy/compose.yml`)
- **Issue:** #8, #19, #20

## Decision

- **Proxy.** One Traefik stack, owned by the plugin, serves every app at `<app>.dev.localhost` and `<app>.uat.localhost`.
  - Apps attach by Compose labels and carry no proxy files.
  - The plugin owns the definition, `proxy/compose.yml`. Its Compose project and Docker network are both named `traefik`, so a proxy already running under those names is adopted.
  - Deploys start the proxy only if it is not running.
  - An agent starts it with `node tools/proxy.mjs up`, which creates the network, refuses when another container holds the port, and also starts the proxy only if it is not running. `recreate` rebuilds it for a version bump and needs the owner's yes. There is no `down`.
  - Traefik is pinned to v3.6.1 or later, by tag and digest, which Docker Engine 29 needs.
- **CI runners.** Ephemeral containerised runners (Docker-in-Docker) run on the owner's machine. Apps carry only a runner label (`ci`). The runners refuse public repositories, because a pull request from anyone would run code on the owner's machine.
- **No deploy runner.** No runner has the host's Docker. The agent deploys uat with the app's guarded deploy script (CLA-0030).
- An app never stops, restarts or reconfigures the proxy or the runners. It never touches the containers, projects or volumes of another app, because the uat of that app depends on them.

## Consequences

- Several apps run side by side on one machine without interfering.
