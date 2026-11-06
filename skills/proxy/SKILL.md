---
name: proxy
description: Starts and checks the one shared Traefik proxy that serves every app at its dev and uat URLs (CLA-0033). Use when an app's .dev.localhost or .uat.localhost URL does not answer, when setting up a machine, or when moving an app onto the shared proxy.
argument-hint: "status | up [--port N] | recreate"
user-invocable: true
---

# Proxy

One Traefik stack, owned by the plugin, serves every app on the machine (CLA-0033). The definition is `proxy/compose.yml` in the plugin. Its Compose project and Docker network are both named `traefik`. Run it only through `tools/proxy.mjs`:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/proxy.mjs" <command>
```

## Commands

- `status` reads only. It shows whether the proxy runs, its image and port, whether the `traefik` network exists, and the URLs of the registered apps. Start here when a URL does not answer.
- `up [--port N]` is the first step on a machine, and safe to repeat. In order, it:
  1. Stops with an error, changing nothing, if a container outside the proxy project publishes the port. A stack deployed before the proxy keeps port 80; stop it first.
  2. Creates the `traefik` network if it is missing.
  3. Starts the proxy only if none runs. A running proxy is left untouched, so one app's deploy never reconfigures what serves another app's uat.
  4. Records the proxy and its port in the machine registry.
- `recreate [--port N]` rebuilds the running proxy from the current definition, for a version bump. Every app's URLs go down for a moment, so ask the owner first; the guardrail asks too.

There is no `down`. Stopping the proxy is the owner's to do by hand. An app never stops, restarts or reconfigures it.

## Apps

- An app carries only Traefik labels on its services. It never holds a copy of the proxy's compose file.
- Register an app once, from its root, so its URLs and protected names are known machine-wide:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/app-registry.mjs" register <appRoot>
```

## Moving an app onto the shared proxy

Do it in this order: the `traefik` network exists (`up` creates it), then the app's environment joins that network with its labels, then the proxy starts or keeps running. A proxy already running under the project `traefik` and the network `traefik` is adopted as it is.

## Checking a URL

No hosts file is needed. Probes resolve the name themselves: `curl --resolve shop.dev.localhost:80:127.0.0.1 http://shop.dev.localhost/`, or Node with a `Host` header against `127.0.0.1`.
