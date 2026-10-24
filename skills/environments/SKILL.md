---
name: environments
description: Claudalisk environment decisions (ADRs) - the dev and prod environments, guarded prod deploys, backups and restores, refreshing dev from prod, the machine-wide proxy and CI runners, the CI workflow, and Node.js scripts. Use when deploying, backing up, restoring, touching Compose files, environment scripts or CI workflows, or running Docker commands in a claudalisk app.
paths:
  - "compose*.yml"
  - "scripts/**"
  - ".env*.example"
  - ".github/workflows/**"
user-invocable: false
---

# Environments

These are claudalisk's decisions for environments, deploys and CI. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before deploying, restoring or changing these files, read the ADR.

- [CLA-0029](${CLAUDE_PLUGIN_ROOT}/adr/0029-dev-and-prod-environments.md) (accepted): dev is the agent's environment; prod holds real data on an external volume, and is never touched by hand.
- [CLA-0030](${CLAUDE_PLUGIN_ROOT}/adr/0030-guarded-prod-deploys.md) (accepted): prod deploys only the exact, pushed, CI-green commit, backing up first, migrating, then starting.
- [CLA-0031](${CLAUDE_PLUGIN_ROOT}/adr/0031-backups-and-restores.md) (accepted): prod backups are versioned with a manifest written last; restores are verified and swapped in, with owner approval for prod.
- [CLA-0032](${CLAUDE_PLUGIN_ROOT}/adr/0032-dev-refreshed-from-prod.md) (accepted): dev is refreshed one way from prod, then migrated.
- [CLA-0008](${CLAUDE_PLUGIN_ROOT}/adr/0008-migrations-are-a-deploy-step.md) (accepted): migrations run as a deploy step, after the backup and before the new API starts.
- [CLA-0033](${CLAUDE_PLUGIN_ROOT}/adr/0033-shared-machine-infrastructure.md) (accepted): the proxy and the CI runners are shared by every app; never stop them or touch another app's resources.
- [CLA-0034](${CLAUDE_PLUGIN_ROOT}/adr/0034-ci-workflow.md) (accepted): CI runs once per pushed commit, in parallel jobs, with a GitHub-hosted fallback.
- [CLA-0027](${CLAUDE_PLUGIN_ROOT}/adr/0027-scripts-in-node.md) (accepted): scripts are Node.js, start processes with argument arrays, and send SQL on stdin.
