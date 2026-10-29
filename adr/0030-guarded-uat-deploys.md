# CLA-0030: The agent deploys pull requests to uat with a guarded deploy script

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the generated deploy script and its guards; guardrail hook (no uat Compose commands, restores or SQL by hand)
- **Issue:** #64, #66

## Context

The owner uses uat to decide whether to merge, so uat needs only the pull request under review. dev is the agent's working environment, and only the agent knows which commit it needs there.

An earlier version of this ADR had CD deploy uat from a workflow on a **deploy runner**: a self-hosted runner with the host's Docker socket and the apps' state folder. An existing app built that runner and backed it out before merging. For one owner on localhost it cost more than it gave:
- **Root-equivalent access.** A runner with the host's Docker is effectively root on the owner's machine. On GitHub's free plan the runner group can't be limited to workflows, so only a runner-side hook keeps other workflows, including a branch's own edited copy, off it.
- **More to maintain.** It was a second runner stack, and the workflow needed `pull_request_target` and `workflow_run` triggers, which the workflow scanner flags (CLA-0071).
- **Little gain.** The agent already opens the pull request and verifies dev, so it is there to deploy uat. The guards below enforce the same rules a workflow would.

## Decision

- **Who deploys uat:** the agent, with the app's deploy script (`node scripts/deploy.mjs --environment uat`), and only as a **review deploy**: when it opens a pull request, or when the head of an open pull request changes. There is no CD workflow and no deploy runner.
- **What may be deployed.** The script refuses before it builds or changes anything unless:
  - the confirmation names the exact commit (`--confirm 'deploy uat <sha7>'`);
  - the working tree is clean, and the commit contains the latest `main` (a branch that fell behind after its CI passed is refused, so a migration merged in the meantime is never taken for one the commit lacks);
  - the commit is the head of an open pull request into `main`, opened by the account the agent and the owner use. A pull request opened by a bot, such as Dependabot (CLA-0072), or by anyone else is never deployed;
  - every CI job succeeded on the commit, including the `up to date with main` check (CLA-0034).
- **What is never deployed:**
  - **`main`.** A pull request merges only from a branch that contains `main` (CLA-0034), so the merge commit has the tree that uat already runs. Nothing deploys `main`, and after a merge uat keeps running the merged head. If a branch is merged while behind `main` anyway, uat differs from `main` until the next pull request deploys. The owner accepts that, because the red `up to date with main` status warned before the merge.
  - **dev.** dev is the agent's (CLA-0029). The agent deploys it by hand whenever it needs to; the review deploy never touches it.
- **Steps:**
  1. Build the images from the commit.
  2. Start the database, and compare the migrations uat has applied with the commit's migration files.
  3. **Refuse a changed migration** that uat has applied (CLA-0010), with nothing changed.
  4. **Refuse migrations the commit lacks** (below), with nothing changed.
  5. Take a uat backup (CLA-0031). Skip it on the very first deploy, while the database is empty.
  6. Migrate with the same image (CLA-0008), and record the applied migrations' fingerprints right away, even if a later step fails.
  7. Start the new version, and check health.
  8. Record the deployment as a GitHub deployment for `uat`.
- **Migrations from other pull requests.** An open pull request's migrations reach uat before it merges. If the commit to deploy lacks a migration that uat has already applied, the deploy **refuses** and changes nothing. It names the newest backup that holds none of those migrations and only migrations the commit knows, and prints the owner's restore command for it (CLA-0031). The deploy never restores uat: replacing real data is the owner's decision. This happens when a pull request is abandoned, or when another pull request replaced it on uat. Removals the owner approved, such as a retired migration history, are listed in `approved-migration-edits.txt` and are not missing.
- **Nothing else changes uat.** The agent never runs Compose commands against uat, restores it, or writes SQL against it by hand. The guardrail hook denies those, and the deploy script is the only way to change uat.
- **Failures.** A failed migration stops the deploy, and the old version keeps running on uat. The script prints the pre-deploy backup, and the owner decides whether to restore it.
- **Unattended deploys.** An app that needs deploys without an agent session can add CD on a deploy runner as described in the earlier version of this ADR (#64). It is a deviation until an ADR describes it again.

## Consequences

- uat always runs a pull request the owner is reviewing or has just merged, and its data is backed up before every change.
- dev never changes under the agent: what it verified stays deployed until it deploys something else.
- An abandoned pull request's migrations block the next deploy until the owner restores uat, which loses the data entered after the backup the deploy names. That is rare, and a refused deploy costs less than an automatic restore over real data.
- uat shows the most recently deployed pull request. A second pull request replaces the first on uat, and the agent tells the owner.
- No runner can reach the host's Docker. The only code that changes uat is the agent's deploy script, run on the owner's machine.
