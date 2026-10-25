# CLA-0030: CD deploys dev and uat together, backing up uat first

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the generated CD workflow and deploy script; guardrail hook (no uat deploys or restores by hand)

## Context

Treating the second environment as production needed heavyweight guards on every deploy. The agent had to type a confirmation that named the exact commit, keep its tree clean and pushed, and check CI itself. There were separate sign-off and post-merge deploys, and a special case for squash commits. Now uat is the owner's review environment (CLA-0029), so CD can deploy automatically. The protections that guard the data stay.

## Decision

- **What CD deploys, and when:**
  - **The head of an open pull request**, after CI succeeds on that commit. Pull requests are opened only when ready for review and are never drafts (CLA-0023). The owner then reviews the head on uat.
  - **`main`**, after the owner merges.

  A branch without a pull request does not deploy. The agent deploys dev by hand while it works.

- **The workflow.** CD is its own workflow, `cd.yml`, separate from CI (CLA-0034):
  - Two triggers start it: CI completion (`workflow_run`) and a pull request that is opened or reopened (`pull_request_target: opened, reopened`).
  - Both triggers run the workflow file and scripts from the default branch, never a pull request's own copy. The commit of the pull request is only what to build and deploy.
  - It deploys a commit only when CI succeeded on it and the commit is `main` or the head of an open pull request.
  - Deploys queue one at a time. CD never cancels a deploy midway.
- **One commit, both environments.** CD deploys the same commit and the same image to dev and uat.
- **Where CD runs.** It runs on a **deploy runner**: a self-hosted runner with the host's Docker socket and a `deploy` label. Only CD jobs of private repositories use it (CLA-0033). CI keeps running on the Docker-in-Docker runners, which cannot reach the host's Docker.
- **Steps, per environment:**
  1. Build the image tagged with the commit.
  2. On uat, take a backup (CLA-0031). Skip it on the very first deploy, while the database is empty.
  3. On uat, put back any migrations that the commit does not have (below).
  4. Migrate with the same image (CLA-0008).
  5. Start the new version.
  6. Check health.
  7. Record the deployment as a GitHub deployment for that environment.
- **Changed migrations.** CD refuses to deploy a commit that changes a migration uat has already applied (CLA-0010).
- **Migrations from other pull requests.** An open pull request's migrations reach uat before it merges. If the commit to deploy lacks a migration that uat has already applied, the deploy does two things:
  1. It restores uat from the latest backup taken before that migration was applied (CLA-0031). This may be the pre-deploy backup of the pull request that introduced the migration.
  2. It then deploys.

  The deploy log and the GitHub deployment report the restore and the data entered since that backup, which is lost. This happens when a pull request is abandoned, or when another pull request replaces it on uat.
- **Who triggers it.** The agent never deploys or restores uat by hand. It may deploy and reset dev by hand at any time. Dev deploys skip the backup and restore steps.
- **Failures.** A failed migration stops the deploy, and the old version keeps running on that environment. CD reports the failure, and the owner decides whether to restore.

## Consequences

- The agent has no confirmation tokens, clean-tree checks or sign-off and post-merge deploy modes to get right. Opening the pull request is enough.
- uat always runs a reviewed commit: the pull request the owner is about to review, or merged `main`. CD backs up its data before every change.
- uat automatically undoes the schema changes of an abandoned pull request. The cost is the loss of data entered after its backup, and CD reports that loss.
- uat shows the most recently opened or updated pull request. A second pull request replaces the first on uat.
