# CLA-0030: Prod deploys are guarded and back up first

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** deploy script guards and their tests; guardrail hook (ask)
- **Issue:** #6, #14, #15

## Decision

A prod deploy happens in only two cases:

- the **sign-off deploy** of a verified pull request head;
- the **post-merge deploy** of `main`.

The deploy refuses unless:

- the confirmation names the exact commit;
- that commit is pushed;
- CI succeeded on it. Proposed in #6: CI also counts as green when a commit with an identical tree passed, which removes the special case for squash commits on `main`.

The deploy runs these steps in order:

1. build an image tagged with the commit;
2. back up prod (skipped on the very first deploy, while the database is empty);
3. migrate using the same image;
4. start the new version;
5. check health;
6. record the deployment.

Rollback has two modes:

- **Code only** (the agent's call): deploy the previous good commit.
- **Code and data**: restore the pre-deploy backup. This needs the owner's approval naming the backup.

## Consequences

- Every prod change is reproducible and can be undone.
