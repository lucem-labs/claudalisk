# CLA-0082: An app's config has one schema, and a machine-wide registry lists every app

- **Status:** accepted
- **Date:** 2026-11-05
- **Area:** environments
- **Enforced by:** `tools/app-config.mjs`, `tools/app-registry.mjs` and their tests in CI's `adrs` job; the `name` check in `templates/app/scripts/verify.mjs`; guardrail hook (protected resources read from the registry, CLA-0083)
- **Issue:** #8, #277

## Context

An app's settings were spread over its scripts and prose: its name, its ports, the uat project and volume, the review globs. Apps on one machine picked ports and names by hand, so two of them could collide, and a hook that protects every app's uat had no list to read.

## Decision

- **An app describes itself in `.claude/claudalisk.json`.** `tools/app-config.schema.json` is the one definition of its shape: the app name, host prefix, repository, databases, dev ports, uat project and volumes, command lists, runner label and review globs.
  - **Unknown keys are an error at every level.** The file holds safety settings, and a typo such as `protectedVolume` would otherwise be skipped without a word.
  - **`dev.volume` is optional** and names the dev database volume when it is not `<name>-dev_postgres-data`, as after a PostgreSQL major upgrade. It is never a volume that holds uat data.
  - `tools/app-config.mjs` validates a file against the schema and reads it. A broken or invalid file throws, listing every problem with its path.
- **`name` is the one source of the app name.** Per-app state lives in `~/.claudalisk/apps/<name>/` (CLA-0066), so a clone in a differently named folder does not split it. It matches `^[a-z0-9][a-z0-9-]*$`, so it cannot build a path outside that folder. An app without a config keeps the name of its repository folder.
- **`~/.claudalisk/apps.json` is the machine-wide registry.** It lists each app's name, repository, host prefix, uat project and volumes and ports, the shared proxy, and a list of runners stacks, each with its Compose project, config folder, scope (organization or repository), target and runner group (CLA-0033, CLA-0086).
  - Registering an app validates its config and is an upsert by name. It fails, and writes nothing, when another app already uses the same repository, host prefix, uat project, uat or protected volume, or a port, naming both apps, or when the uat project is the proxy's or one of the runners stacks'.
  - **The same name from another repository is refused,** because replacing the entry would drop the first app's uat from the registry. `--replace` is for a repository that moved.
  - New ports are the lowest free ones at or above the bases, among those no registered app uses. new-app also checks that they are free on the machine.
  - A write never leaves a file that the next read rejects: it refuses a registry of the wrong shape and replaces the file in one rename. Writes take no lock, because registering is rare, so two registrations at the same moment can lose one, and running it again restores it.
- **A corrupt registry is an error, never an empty one.** The guardrail hook reads it to protect every app's uat, and an empty list would protect nothing.
- **The e2e ports are not in it.** The e2e harness takes free ports, because fixed ones collided between CI runs.
- **Who writes it:** the new-app skill registers the app it creates, the proxy skill registers the proxy, and the runners skill registers each stack it adopts or starts (an upsert by Compose project), and `node tools/app-registry.mjs register <appRoot>` registers an app adopted by hand.

## Consequences

- A new app gets ports and names that no other app on the machine uses.
- A mistyped key in the config fails when it is read, not when the setting is needed.
- Neither file has a version of its own. A removed or renamed key, or a new required one, is a breaking change of the plugin (CLA-0098).
- The registry holds names and ports, never secrets.
- Moving to another machine means registering the app again.
