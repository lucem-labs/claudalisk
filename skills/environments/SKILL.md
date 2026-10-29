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
- [CLA-0030](${CLAUDE_PLUGIN_ROOT}/adr/0030-guarded-uat-deploys.md) (accepted): the agent review-deploys uat with the app's guarded deploy script: only the head of an open pull request the owner's account opened, after every CI job succeeds, with the exact commit confirmed. It never deploys `main`, dev or bot pull requests; the agent deploys dev by hand. There is no CD and no deploy runner. It backs up uat first, and refuses a changed applied migration or one the commit lacks; only the owner restores uat.
- [CLA-0031](${CLAUDE_PLUGIN_ROOT}/adr/0031-backups-and-restores.md) (accepted): uat backups are versioned with a manifest written last. Restores are verified and swapped in. Only the owner restores uat; a deploy that finds migrations the commit lacks refuses and prints the restore command.
- [CLA-0032](${CLAUDE_PLUGIN_ROOT}/adr/0032-dev-refreshed-from-uat.md) (accepted): dev is refreshed one way from uat, then migrated.
- [CLA-0008](${CLAUDE_PLUGIN_ROOT}/adr/0008-migrations-are-a-deploy-step.md) (accepted): migrations run as a deploy step, after the backup and before the new API starts.
- [CLA-0033](${CLAUDE_PLUGIN_ROOT}/adr/0033-shared-machine-infrastructure.md) (accepted): every app shares the proxy and the CI runners. Never stop them or touch another app's resources.
- [CLA-0034](${CLAUDE_PLUGIN_ROOT}/adr/0034-ci-workflow.md) (accepted): CI runs once per pushed commit except on `main`, in parallel jobs, with a GitHub-hosted fallback. Every pull request shows whether it is up to date with `main`, so a merge commit has the tree CI already tested.
- [CLA-0027](${CLAUDE_PLUGIN_ROOT}/adr/0027-scripts-in-node.md) (accepted): scripts are Node.js, start processes with argument arrays and send SQL on stdin.
- [CLA-0066](${CLAUDE_PLUGIN_ROOT}/adr/0066-environment-state-outside-the-checkout.md) (accepted): env files and uat backups live in `~/.claudalisk/apps/<app>/`, never in the checkout; the environment scripts read them on the machine; uat never falls back to an example file.
- [CLA-0071](${CLAUDE_PLUGIN_ROOT}/adr/0071-security-scans.md) (accepted): every push runs gitleaks, a forbidden-file check, `lucem-labs/nuget-audit-action`, OSV-Scanner, .NET analyzers with Semgrep CE, zizmor and Trivy config; weekly runs rescan dependencies, scan images with Trivy and run a ZAP baseline against dev; every suppression expires within 90 days.
