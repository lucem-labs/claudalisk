# CLA-0030: CD deploys dev and uat together, backing up uat first

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the generated CD workflow and deploy script; guardrail hook (no uat deploys or restores by hand)

## Context

Treating the second environment as production needed heavyweight guards on every deploy. The agent had to type a confirmation naming the exact commit, keep its tree clean and pushed, and check CI itself. There were separate sign-off and post-merge deploys, and a special case for squash commits. With uat as the owner's review environment (CLA-0029), CD can deploy automatically, and the protections that matter, which guard the data, stay.

## Decision

- **What CD deploys, and when:**
  - **The head of an open pull request**, once CI has succeeded on that commit. Pull requests are opened only when ready for review and are never drafts (CLA-0023). The owner then reviews the head on uat.
  - **`main`**, after the owner merges.

  A branch without a pull request doesn't deploy. The agent deploys dev by hand while it works.
- **One commit, both environments.** CD deploys the same commit to dev and uat, using the same image.
- **Where CD runs.** It runs on a **deploy runner**: a self-hosted runner with the host's Docker socket and a `deploy` label, used only by CD jobs of private repositories (CLA-0033). CI keeps running on the Docker-in-Docker runners, which can't reach the host's Docker.
- **Steps, per environment:**
  1. build the image tagged with the commit;
  2. on uat, take a backup (CLA-0031), except on the very first deploy, while the database is empty;
  3. on uat, put back any migrations the commit doesn't have (below);
  4. migrate with the same image (CLA-0008);
  5. start the new version;
  6. check health;
  7. record the deployment as a GitHub deployment for that environment.
- **Migrations from other pull requests.** An open pull request's migrations reach uat before it merges. If the commit being deployed lacks a migration that uat has already applied, the deploy:
  1. restores uat from the latest backup taken before that migration was applied (CLA-0031), which may be the pre-deploy backup of the pull request that introduced it;
  2. then deploys.

  The deploy log and the GitHub deployment report the restore and which data entered since that backup was lost. This happens when a pull request is abandoned, or when another pull request replaces it on uat.
- **Who triggers it.** The agent never deploys or restores uat by hand. It may deploy and reset dev by hand at any time. Dev deploys skip the backup and restore steps.
- **Failures.** A failed migration stops the deploy with the old version still running on that environment. CD reports the failure, and the owner decides whether to restore.

## Consequences

- No more confirmation tokens, clean-tree checks or sign-off and post-merge deploy modes for the agent to get right. Opening the pull request is enough.
- uat always runs a reviewed commit: either the pull request the owner is about to review or merged `main`. Its data is backed up before every change.
- An abandoned pull request's schema changes are undone on uat automatically. The cost is losing data entered after its backup, and CD reports that loss.
- uat shows the most recently opened or updated pull request. Opening or updating a second pull request replaces the first on uat.
