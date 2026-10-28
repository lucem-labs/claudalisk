# CLA-0030: CD deploys pull requests to uat, backing uat up first

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the generated CD workflow and deploy script; guardrail hook (no uat deploys or restores by hand)
- **Issue:** #64

## Context

Treating the second environment as production needed heavyweight guards on every deploy. The agent had to type a confirmation that named the exact commit, keep its tree clean and pushed, and check CI itself. There were separate sign-off and post-merge deploys, and a special case for squash commits. Now uat is the owner's review environment (CLA-0029), so CD can deploy automatically. The protections that guard the data stay.

The owner uses uat to decide whether to merge, so uat needs only the pull request under review. dev is the agent's working environment, and only the agent knows which commit it needs there.

## Decision

- **What CD deploys:** the head of an open pull request into `main`, after every CI job succeeds on that commit (CLA-0034). It deploys to **uat only**.
  - **Who opened it.** CD deploys only pull requests opened by the owner's account, which the agent also uses. A pull request opened by a bot, such as Dependabot (CLA-0072), or by anyone else is never deployed.
  - **Never `main`.** A pull request merges only from a branch that contains `main` (CLA-0034), so the merge commit has the tree that uat already runs. Nothing deploys `main`, and after a merge uat keeps running the merged head. If a branch is merged while behind `main` anyway, uat differs from `main` until the next pull request deploys. The owner accepts that, because the red `up to date with main` status warned before the merge.
  - **Never dev.** dev is the agent's (CLA-0029). The agent deploys it by hand whenever it needs to, and CD never touches it.
  - A branch without a pull request does not deploy.
- **The workflow.** CD is its own workflow, `cd.yml`, separate from CI (CLA-0034):
  - Two triggers start it: CI completion (`workflow_run`) and a pull request that is opened or reopened (`pull_request_target: opened, reopened`).
  - Both triggers run the workflow file and scripts from the default branch, never a pull request's own copy. The commit of the pull request is only what to build and deploy.
  - It deploys a commit only when it is the head of an open pull request that the owner's account opened, and every CI job succeeded on it.
  - Deploys queue one at a time. CD never cancels a deploy midway.
- **Where CD runs.** It runs on a **deploy runner**: a self-hosted runner with the host's Docker socket and a `deploy` label. Only CD jobs of private repositories use it (CLA-0033). CI keeps running on the Docker-in-Docker runners, which cannot reach the host's Docker.
- **Steps:**
  1. Build the image tagged with the commit.
  2. Take a uat backup (CLA-0031). Skip it on the very first deploy, while the database is empty.
  3. Put back any migrations that the commit does not have (below).
  4. Migrate with the same image (CLA-0008).
  5. Start the new version.
  6. Check health.
  7. Record the deployment as a GitHub deployment for `uat`.
- **Changed migrations.** CD refuses to deploy a commit that changes a migration uat has already applied (CLA-0010).
- **Migrations from other pull requests.** An open pull request's migrations reach uat before it merges. If the commit to deploy lacks a migration that uat has already applied, the deploy does two things:
  1. It restores uat from the latest backup taken before that migration was applied (CLA-0031). This may be the pre-deploy backup of the pull request that introduced the migration.
  2. It then deploys.

  The deploy log and the GitHub deployment report the restore and the data entered since that backup, which is lost. This happens when a pull request is abandoned, or when another pull request replaces it on uat.
- **Who triggers it.** The agent never deploys or restores uat by hand.
- **Failures.** A failed migration stops the deploy, and the old version keeps running on uat. CD reports the failure, and the owner decides whether to restore.

## Consequences

- The agent has no confirmation tokens, clean-tree checks or sign-off and post-merge deploy modes to get right. Opening the pull request is enough.
- uat always runs a pull request the owner is reviewing or has just merged. CD backs up its data before every change.
- dev never changes under the agent: what it verified stays deployed until it deploys something else.
- uat automatically undoes the schema changes of an abandoned pull request. The cost is the loss of data entered after its backup, and CD reports that loss.
- uat shows the most recently opened or updated pull request. A second pull request replaces the first on uat.
- Dependabot updates are not tried on uat. CI is their gate. To try one on uat, the agent opens its own pull request with the update.
