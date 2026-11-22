# CLA-0099: Every app carries a semantic version, and deploys and backups record it

- **Status:** accepted
- **Date:** 2026-11-22
- **Area:** workflow
- **Enforced by:** `check-version` of `@claudalisk/scripts` in the app's CI (CLA-0084); the deploy and backup scripts and their tests; reviewer for the size of a bump
- **Issue:** #273

## Context

Claudalisk's own artifacts have versions (CLA-0098), but an app had none. A deploy, its images and a backup were named only by a commit, which says nothing about order or about how much changed.

Rejected:

- A version derived from commit messages or from the distance to a tag, for the reasons in CLA-0098.
- A version in the app config. The config describes how the app is set up on a machine (CLA-0082), not the state of its code.
- An exception for Dependabot pull requests. Then two different states of `main` would share a version.

## Decision

- **An app's version is the `version` field of the root `package.json`.** It follows Semantic Versioning 2.0.0, with the prerelease form and the ban on build metadata of CLA-0098.
- **Every pull request raises it.** `check-version` runs in CI and fails a branch whose version is not higher than the one on `origin/main`. It has no exception: on a Dependabot pull request the agent pushes a patch bump (CLA-0072).
- **The size of the bump says how much changed:**
  - patch: a fix, a dependency update, or a change no user sees;
  - minor: a new capability, or a change to stored data such as a migration;
  - major: the owner's decision, as is the move to 1.0.0.
- **A deploy carries the version** (CLA-0030). The deploy script reads it from the checkout and:
  - passes `DEPLOYED_VERSION` to the API and migrate containers, next to `DEPLOYED_SHA` and `DEPLOYED_REF`;
  - tags each image it built as `<project>-<service>:<version>`, and removes the version tags of images that are neither current nor previous;
  - names it in the GitHub deployment.
- **A backup records the version** as `deployedVersion` in its manifest, read from the API container like the commit (CLA-0031). The folder name stays `<UTC timestamp>-<sha7>`, so older backups and newer ones are read the same way.
- **The version is a label, not an identity.** Several deploys share one version: each push to a pull request, and each dev deploy of uncommitted work. Two open pull requests can claim the same number. So a deploy is still identified by its commit, and retention goes by deploy order, never by version order.
- **An app without a version still deploys,** labelled by its commit alone. The CI check is what requires the version.

## Consequences

- uat and its backups read as "1.4.0, and before that 1.3.2".
- Two open pull requests conflict on the version line. The one that merges second merges `main` and raises the version again, which the `up to date with main` status already asks for (CLA-0034).
- Each Dependabot update needs a push from the agent, after which Dependabot stops rebasing that branch (CLA-0072).
- An existing app adopts this by adding the version, the `DEPLOYED_VERSION` lines in `compose.base.yml`, the `check-version` entry script and its CI step.
