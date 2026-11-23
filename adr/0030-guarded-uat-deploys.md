# CLA-0030: The agent deploys pull requests to uat with a guarded deploy script

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the deploy script of `@claudalisk/scripts` and its guards (CLA-0084); guardrail hook (no uat Compose commands, restores or SQL by hand)
- **Issue:** #64, #66, #273, #276, #278, #280

## Context

The owner uses uat to decide whether to merge, so uat needs only the pull request under review. dev is the agent's working environment, and only the agent knows which commit it needs.

Rejected: CD that deploys uat from a workflow on a deploy runner, a self-hosted runner with the host's Docker socket. For one owner on localhost it cost more than it gave. Such a runner is effectively root on the owner's machine, it is a second runner stack, and its triggers are ones the workflow scanner flags (CLA-0071). The agent already opens the pull request and verifies dev, and the guards below enforce what a workflow would. An app that needs unattended deploys lists that as a deviation (CLA-0028) until an ADR describes it.

## Decision

- **Only the agent deploys uat,** with `node scripts/deploy.mjs --environment uat`, and only as a review deploy: when it opens a pull request, or when an open pull request's head changes. Nothing deploys `main`: after a merge, uat keeps running the merged head. The review deploy never touches dev, which the agent deploys by hand (CLA-0029).
- **The script refuses before it builds or changes anything unless:**
  - the confirmation names the exact commit (`--confirm 'deploy uat <sha7>'`);
  - the checkout's `origin` is the repository in the app config;
  - the working tree is clean, and the commit contains the latest `main`, so a migration merged since CI passed is never taken for one the commit lacks;
  - the commit is the head of an open pull request into `main`, opened by the account the agent and the owner use, never a bot such as Dependabot (CLA-0072);
  - every CI job succeeded on the commit, including `up to date with main` (CLA-0034).
- **Steps, in order:**
  1. Start the database, and compare the migrations uat has applied with the commit's.
  2. Refuse, with nothing changed, a changed applied migration (CLA-0010), migrations the commit lacks, or an empty database next to complete backups.
  3. Build the images.
  4. Back up uat (CLA-0031), except on the first deploy to an empty database.
  5. Migrate with the same image (CLA-0008), and record the migrations' fingerprints at once, even if a later step fails.
  6. Start the built image without rebuilding it, and check health.
  7. Record a GitHub deployment for `uat`, with the app's version (CLA-0099).
  8. Remove the older images.
- **A deploy keeps two sets of images per environment,** the current and the previous, on dev and uat. Built images keep Compose's default name, `<project>-<service>`. A deploy refuses, with nothing changed, a Compose file that names one otherwise, because a per-commit tag has no `latest` to compare. After the health check passes, the image each service ran becomes `:previous`, and the project's untagged images and those of services the Compose files dropped are removed, never one a container uses. It never removes a volume or another project's image. A failure here is only a warning, and a failed deploy removes nothing.
- **Migrations from other pull requests.** An open pull request's migrations reach uat before it merges. If the commit lacks a migration that uat already applied, the deploy refuses and changes nothing. It names the newest backup that holds only migrations the commit knows, and prints the owner's restore command (CLA-0031). The deploy never restores uat. Only schemas the commit migrates count, so a retired schema is not missing.
- **An empty database next to complete backups is not a first deploy.** It is the wrong volume or a lost one. The deploy refuses, changes nothing, and names uat's volume, the newest backup and the owner's restore command (CLA-0031).
- **A failed migration stops the deploy.** The old version keeps running, and the script prints the pre-deploy backup for the owner to decide on.

## Consequences

- uat always runs a pull request the owner is reviewing or has just merged, and its data is backed up before every change.
- dev never changes under the agent.
- An abandoned pull request's migrations block the next deploy until the owner restores uat, which loses the data entered after that backup. That is rare, and a refused deploy costs less than an automatic restore over real data.
- A second pull request replaces the first on uat, and the agent tells the owner.
- If a branch is merged while behind `main` anyway, uat differs from `main` until the next deploy. The red `up to date with main` status warned the owner first.
- No runner can reach the host's Docker. The only code that changes uat is the deploy script.
