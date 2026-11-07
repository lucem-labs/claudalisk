---
name: environments
description: Claudalisk environment decisions (ADRs). Covers the dev and uat environments, the guarded uat deploy of pull requests, uat backups and restores, refreshing dev from uat, the machine-wide proxy and CI runners, the CI workflow, security scans, and Node.js scripts. Use when deploying, backing up, restoring, touching Compose files, environment scripts or CI workflows, or running Docker commands in a claudalisk app.
paths:
  - "compose*.yml"
  - "scripts/**"
  - ".env*.example"
  - ".github/workflows/**"
user-invocable: false
---

# Environments

These are claudalisk's decisions for environments, deploys and CI. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before deploying, restoring or changing these files, read the ADR.

- [CLA-0029](${CLAUDE_PLUGIN_ROOT}/adr/0029-dev-and-uat-environments.md) (accepted): dev is the agent's environment. uat is the owner's, with real data that changes only through the app and the migrations of the guarded review deploy, never by the agent's hand.
- [CLA-0030](${CLAUDE_PLUGIN_ROOT}/adr/0030-guarded-uat-deploys.md) (accepted): the agent review-deploys uat with the guarded deploy script: only the head of an open pull request the owner's account opened, with CI green and the commit confirmed. It backs up, refuses changed or missing migrations and never deploys `main`.
- [CLA-0031](${CLAUDE_PLUGIN_ROOT}/adr/0031-backups-and-restores.md) (accepted): uat backups are versioned with a manifest written last. Restores are verified and swapped in. Only the owner restores uat; a deploy that finds migrations the commit lacks refuses and prints the restore command.
- [CLA-0032](${CLAUDE_PLUGIN_ROOT}/adr/0032-dev-refreshed-from-uat.md) (accepted): dev is refreshed one way from uat, then migrated.
- [CLA-0008](${CLAUDE_PLUGIN_ROOT}/adr/0008-migrations-are-a-deploy-step.md) (accepted): Migrations are an explicit deploy step.
- [CLA-0033](${CLAUDE_PLUGIN_ROOT}/adr/0033-shared-machine-infrastructure.md) (accepted): every app shares the proxy and the CI runners. Never stop them or touch another app's resources.
- [CLA-0034](${CLAUDE_PLUGIN_ROOT}/adr/0034-ci-workflow.md) (accepted): CI runs once per pushed commit except on `main`, in parallel jobs, with a GitHub-hosted fallback. Every pull request shows whether it is up to date with `main`, so a merge commit has the tree CI already tested.
- [CLA-0027](${CLAUDE_PLUGIN_ROOT}/adr/0027-scripts-in-node.md) (accepted): Scripts are written in Node.js.
- [CLA-0066](${CLAUDE_PLUGIN_ROOT}/adr/0066-environment-state-outside-the-checkout.md) (accepted): env files, uat backups, verify logs and other per-app state live in `~/.claudalisk/apps/<app>/`, never in the checkout. The init script generates the database password, writes the env file and creates the volume; no deploy writes one.
- [CLA-0082](${CLAUDE_PLUGIN_ROOT}/adr/0082-app-config-and-machine-registry.md) (accepted): `.claude/claudalisk.json` follows one schema that rejects unknown keys, and its `name` names the app everywhere. `~/.claudalisk/apps.json` lists every app, and a corrupt one is an error.
- [CLA-0083](${CLAUDE_PLUGIN_ROOT}/adr/0083-guardrail-hook.md) (accepted): a hook checks every shell command. It denies uat, proxy, runner and merge commands, `down -v` and opaque PowerShell, and asks on runner-group, `runners.mjs`, runners-config edits and `git add -f` changes. A crash asks.
- [CLA-0084](${CLAUDE_PLUGIN_ROOT}/adr/0084-environment-scripts-package.md) (accepted): the deploy, backup, restore, refresh, init and migrate logic is the pinned npm package `@claudalisk/scripts`. Each app keeps thin `scripts/<name>.mjs` entries that only call it, and pins an exact version. Every command refuses to run in CI.
- [CLA-0085](${CLAUDE_PLUGIN_ROOT}/adr/0085-session-start-router.md) (accepted): a session-start hook, in an app only, prints `dev runs <ref>@<sha7>; uat runs ...` from `/api/health` (500 ms each, via 127.0.0.1), a uat deployment fallback, the branch and PRs. It never blocks.
- [CLA-0086](${CLAUDE_PLUGIN_ROOT}/adr/0086-runners-stack-from-the-kit.md) (accepted): one org-wide runner stack from the public kit, set up by `/claudalisk:runners`: pins in `runners.env`, config and key outside any repository, GitHub App by manifest flow, selected private repositories, `enroll` per app, no `down`.
- [CLA-0071](${CLAUDE_PLUGIN_ROOT}/adr/0071-security-scans.md) (accepted): every push runs gitleaks, a forbidden-file check, dependency audits, static analysis, zizmor and Trivy config; weekly runs rescan dependencies and images and run ZAP against dev. Scanners are pinned by SHA-256, and every suppression expires within 90 days.
- [CLA-0076](${CLAUDE_PLUGIN_ROOT}/adr/0076-one-verify-script-per-cycle.md) (accepted): One verify call per cycle pushes to CI and prints only the failures.
