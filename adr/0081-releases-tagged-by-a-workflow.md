# CLA-0081: A workflow tags, checks and publishes each release from the plugin version

- **Status:** accepted
- **Date:** 2026-11-04
- **Area:** workflow
- **Enforced by:** `.github/workflows/release.yml`; `tools/release.mjs` and its tests in CI's `adrs` job; npm trusted publishing and the `production` environment; reviewer
- **Issue:** #76

## Context

Apps pin claudalisk to a release: the plugin by version, the registry by its `v<version>` tag (CLA-0055) and the scripts package by an exact npm version. A release that depends on someone remembering to push a tag after a merge gets forgotten or tags the wrong commit, and nothing checks that the tagged registry actually serves every item.

## Decision

- **The version in `.claude-plugin/plugin.json` is the release.** A pull request that should ship bumps it. Nothing else marks a release.
- **On every push to `main`, `release.yml` releases a version that has no tag yet.** When `v<version>` already exists, the run does nothing. Its `release` job:
  - tags the pushed commit `v<version>`;
  - runs `node tools/release.mjs check`, which fetches every item of `registry/registry.json` from the release URL of CLA-0055 and fails unless each returns its own JSON. It retries for a short while, since the URL can lag the tag. On a failure it deletes the tag it just pushed, so the next push or a manual run tries again;
  - creates the GitHub release with notes from `node tools/release.mjs notes` (the registry URL, the items and, when there is a scripts package, its npm approval) followed by GitHub's generated notes;
  - when `packages/scripts/package.json` exists, starts the same workflow on the new tag to publish it.
- **The `publish` job publishes `@claudalisk/scripts` with npm trusted publishing (OIDC), never a token.**
  - It runs only on a `v*` tag, in the `production` environment, which is limited to `v*` tags. Its only extra permission is `id-token: write`.
  - npm's trusted publisher names this repository, `release.yml` and `production`, so the file keeps that name.
  - It checks that the tag is the plugin version, skips a version already on npm, and runs `npm publish --provenance`.
  - npm stages the publish. The run ends there, and the owner approves the release on npmjs.com before it goes live.
- **No one tags or publishes by hand.** A failed run is fixed by a new pull request or rerun from the Actions tab.

## Consequences

- A merged version bump is a release. Merging a pull request that bumps the version is the owner's decision to ship (CLA-0024).
- A broken registry build never becomes a release that apps can pin.
- A scripts package version needs both this workflow and the owner's approval on npm.
- v0.2.0 was tagged by hand before this workflow existed. The workflow's first release is the next version.
