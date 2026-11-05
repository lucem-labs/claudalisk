# CLA-0082: An app's config has one schema, and a machine-wide registry lists every app

- **Status:** accepted
- **Date:** 2026-11-05
- **Area:** environments
- **Enforced by:** `tools/app-config.mjs`, `tools/app-registry.mjs` and their tests in CI's `adrs` job; the `name` check in `templates/app/scripts/verify.mjs`; guardrail hook (protected resources read from the registry, planned in #2)
- **Issue:** #8

## Context

An app's settings were spread over its scripts and prose: its name, its ports, the uat project and volume, the review globs. Apps on one machine picked ports and names by hand, so two of them could collide, and a hook that protects every app's uat had no list to read.

## Decision

- **An app describes itself in `.claude/claudalisk.json`.** `tools/app-config.schema.json` is the one definition of its shape: the app name, host prefix, repository, databases, dev ports, uat project and volumes, backup count, command lists, runner label and review globs.
  - **Unknown keys are an error at every level.** The file holds safety settings, and a typo such as `protectedVolume` would otherwise be skipped without a word.
  - `tools/app-config.mjs` validates a file against the schema and reads it. A broken or invalid file throws, listing every problem with its path.
- **`name` is the one source of the app name.** Per-app state lives in `~/.claudalisk/apps/<name>/` (CLA-0066), so a clone in a differently named folder does not split it. It matches `^[a-z0-9][a-z0-9-]*$`, so it cannot build a path outside that folder. An app without a config keeps the name of its repository folder.
- **`~/.claudalisk/apps.json` is the machine-wide registry.** It lists each app's name, repository, host prefix, uat project and volumes and ports, and the shared proxy and runners stacks (CLA-0033).
  - Registering an app validates its config and is an upsert by name. It fails, and writes nothing, when another app already uses the same repository, host prefix, uat project, uat or protected volume, or a port, naming both apps, or when the uat project is the proxy's or the runners'.
  - **The same name from another repository is refused,** because replacing the entry would drop the first app's uat from the registry. `--replace` is for a repository that moved.
  - New ports come from `allocatePorts`: the lowest ports at or above the bases that no registered app uses, counting both roles. It reads only the registry, so new-app checks that they are free on the machine.
  - Writes refuse a registry of the wrong shape and go to a temporary file that is renamed over the registry, retrying while another process holds it, so neither a bad call nor a crash leaves a file the next read rejects.
  - Writes take no lock. Registering is a rare step that a person or new-app runs, and a stale lock would block it; two registrations at the same moment can lose one, and running it again restores it.
- **A corrupt registry is an error, never an empty one.** The guardrail hook reads it to protect every app's uat, and an empty list would protect nothing.
- **The e2e ports are not in it.** The e2e harness takes free ports, because fixed ones collided between CI runs.
- **Who writes it:** the new-app skill registers the app it creates, the proxy and runners skills register their stacks, and `node tools/app-registry.mjs register <appRoot>` registers an app adopted by hand.

## Consequences

- A new app gets ports and names that no other app on the machine uses.
- A mistyped key in the config fails when it is read, not when the setting is needed.
- The registry holds names and ports, never secrets.
- Moving to another machine means registering the app again.
