# CLA-0098: Every claudalisk artifact follows Semantic Versioning

- **Status:** accepted
- **Date:** 2026-11-22
- **Area:** workflow
- **Enforced by:** `tools/semver.mjs` for validity and precedence; `tools/check-versions.mjs` in CI for version order and changed scripts package content against the last release tag, and in `release.yml` (CLA-0081) before a tag is made; `packages/scripts/test/exports.test.mjs` for the scripts package's exports; `scripts/release-version.mjs` and package validation in lucem-labs/claudalisk-dotnet; reviewer for the size of a bump. Not built yet in claudalisk-dotnet: the checks for version order and breaks against the last release (lucem-labs/claudalisk-dotnet#58)
- **Issue:** #269

## Context

Apps pin every claudalisk artifact to an exact version (CLA-0062, CLA-0081, CLA-0084), and an update arrives as a pull request that changes a number (CLA-0072). That number has to say whether the update is safe to take. Without a rule, a removed skill or a renamed config key ships under a number that looks like a fix.

Rejected: deriving the version from commit messages or from the distance to the last tag. A bump is a judgement about the public API, and the pull request that makes the change carries it for review. Also rejected: date-based versions, which say nothing about compatibility.

## Decision

- **Every artifact claudalisk publishes has a version that follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).** There are three version lines:
  - the plugin, and with it the registry served at its tag (CLA-0055), from `.claude-plugin/plugin.json` (CLA-0081);
  - `@claudalisk/scripts`, from its `package.json` (CLA-0084);
  - the `Claudalisk.*` NuGet packages, which share one version taken from the release tag in claudalisk-dotnet (CLA-0062).
- **A release tag is `v<version>`** in both repositories.
- **An artifact's public API is what an app or its owner relies on by name:**
  - the plugin: skills and their arguments, agents, the commands of `tools/`, what the hooks deny and ask, the app config schema and the machine registry's format (CLA-0082), ADR ids, and registry items with their files and props;
  - the scripts package: its `exports`, the arguments and exit codes of the entry scripts, the config fields it requires, and the files it writes that a later version reads, such as backups (CLA-0031);
  - a NuGet package: its public and protected types and members, its configuration keys and the database objects it owns.
- **A change is breaking when an app that worked with the last release must change to work with this one.** Removing or renaming part of the public API is breaking. So is a stricter check, a config key that becomes required, a retired ADR id, and a new rule that existing apps must meet. A template change alone is not, because it reaches only apps generated after it.
- **While the major version is 0, a breaking change bumps the minor version and everything else bumps the patch.** From 1.0.0, a breaking change bumps the major, an addition the minor and a fix the patch. The owner decides when an artifact reaches 1.0.0.
- **A prerelease is `<version>-<stage>.<n>`,** with the stage `alpha`, `beta` or `rc` and a number, as in `0.1.0-alpha.4`. The dot makes the number compare as a number, so `alpha.10` follows `alpha.9`. A prerelease may break the one before it. No version carries build metadata.
- **Each release is higher than every earlier release on its line.**
- **A released version never changes.** Its tag is never moved or reused, and a version on npm or nuget.org is never replaced. Content that differs from a released version ships only under a higher one. A bad release is fixed by a new version, and the bad one is deprecated or unlisted.

## Consequences

- While an artifact is at 0.y.z, a patch should need no change in the app, and a minor means reading the release notes first.
- The NuGet packages move together. A package can get a new version with no change of its own, and a break in one bumps them all.
- This covers what claudalisk publishes. An app's API has no version numbers (CLA-0041).
