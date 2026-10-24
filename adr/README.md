# Architecture decision records

These are claudalisk's standards for the apps it builds. Each ADR is written once here. The knowledge skills in [`skills/`](../skills) index the ADRs for their area and link to them through `${CLAUDE_PLUGIN_ROOT}/adr/…`, so Claude loads an ADR only when the work needs it. A skill with `paths` loads automatically when Claude works with matching files.

An app's own `AGENTS.md` wins where it differs. It lists each deliberate deviation by ADR id ([CLA-0028](0028-app-agents-md-wins.md)).

## Index

| ADR | Decision | Status | Area |
|---|---|---|---|
| [CLA-0001](0001-modular-monolith.md) | The backend is a modular monolith | accepted | backend-architecture |
| [CLA-0002](0002-interfaces-projects.md) | Modules are referenced only through their Interfaces projects | accepted | backend-architecture |
| [CLA-0003](0003-lean-interfaces-projects.md) | Interfaces projects are lean, and pass messages that are POCOs | accepted | backend-architecture |
| [CLA-0004](0004-module-registration.md) | Module registration is idempotent and declares dependencies | accepted | backend-architecture |
| [CLA-0005](0005-thin-controllers-and-mapping.md) | Controllers stay thin; mapping is internal extension methods | accepted | backend-architecture |
| [CLA-0006](0006-architecture-tests-by-convention.md) | Architecture tests discover modules by naming convention | proposed | backend-architecture |
| [CLA-0007](0007-persistence-owns-ef-core.md) | EF Core and PostgreSQL, owned by persistence projects; a module may own its database | accepted | data-and-migrations |
| [CLA-0008](0008-migrations-are-a-deploy-step.md) | Migrations are an explicit deploy step | accepted | data-and-migrations |
| [CLA-0009](0009-no-data-changes-at-startup.md) | No data changes at startup | accepted | data-and-migrations |
| [CLA-0010](0010-applied-migrations-are-immutable.md) | Applied migrations are never edited | accepted | data-and-migrations |
| [CLA-0011](0011-fresh-database-migrates.md) | A fresh, empty database migrates end to end | proposed | data-and-migrations |
| [CLA-0012](0012-one-off-data-fixes.md) | One-off data fixes are reviewed, idempotent scripts | proposed | data-and-migrations |
| [CLA-0013](0013-external-data-on-explicit-trigger.md) | External data is refreshed only on an explicit trigger, and never from tests | proposed | data-and-migrations |
| [CLA-0014](0014-frontend-stack-and-api-module.md) | React, TypeScript and Vite, with one typed API module | accepted | frontend-conventions |
| [CLA-0015](0015-ui-renders-api-values.md) | The UI renders what the API returns and never duplicates backend rules | accepted | frontend-conventions |
| [CLA-0016](0016-every-change-ships-with-tests.md) | Every behaviour change ships with tests | accepted | testing |
| [CLA-0017](0017-tests-run-on-throwaway-stacks.md) | Tests run on throwaway stacks | accepted | testing |
| [CLA-0018](0018-real-postgres-never-skipped.md) | Persistence tests use real PostgreSQL and never skip silently | proposed | testing |
| [CLA-0019](0019-parallel-safe-tests.md) | Tests are parallel-safe | proposed | testing |
| [CLA-0020](0020-no-wall-clock-assertions.md) | No wall-clock assertions in tests | proposed | testing |
| [CLA-0021](0021-issue-driven-work.md) | All work is issue-driven | accepted | workflow |
| [CLA-0022](0022-bugs-found-become-issues.md) | Bugs found along the way become new issues | accepted | workflow |
| [CLA-0023](0023-ready-signoff-and-merge.md) | Ready means CI green and verified; the owner signs off on prod | accepted | workflow |
| [CLA-0024](0024-owner-merges.md) | The owner merges; the agent runs the merge check | proposed | workflow |
| [CLA-0025](0025-stacked-pull-requests.md) | Stacked pull requests merge in order without closing children | proposed | workflow |
| [CLA-0026](0026-no-real-data-or-secrets-in-git.md) | Real data and secrets never go into commits, pull requests or issues | accepted | workflow |
| [CLA-0027](0027-scripts-in-node.md) | Scripts are written in Node.js | accepted | environments |
| [CLA-0028](0028-app-agents-md-wins.md) | The app's AGENTS.md wins, and deviations cite ADR ids | accepted | workflow |
| [CLA-0029](0029-dev-and-prod-environments.md) | Two local environments: dev for the agent, prod for real data | accepted | environments |
| [CLA-0030](0030-guarded-prod-deploys.md) | Prod deploys are guarded and back up first | accepted | environments |
| [CLA-0031](0031-backups-and-restores.md) | Prod backups are versioned; restores are verified and swapped in | accepted | environments |
| [CLA-0032](0032-dev-refreshed-from-prod.md) | Dev is refreshed one way from prod | accepted | environments |
| [CLA-0033](0033-shared-machine-infrastructure.md) | The proxy and CI runners are shared by every app on the machine | accepted | environments |
| [CLA-0034](0034-ci-workflow.md) | CI runs once per pushed commit, fully parallel | accepted | environments |

## Format

Each ADR is `NNNN-short-slug.md` with id `CLA-NNNN`. Ids are stable and never reused. It starts with:

```markdown
# CLA-NNNN: Decision as a sentence

- **Status:** proposed | accepted | superseded by CLA-NNNN
- **Date:** YYYY-MM-DD
- **Area:** backend-architecture | data-and-migrations | frontend-conventions | testing | workflow | environments
- **Enforced by:** hook | test | CI | reviewer | prompt only (be specific)
- **Issue:** #n (optional)
```

Then come **Context** (optional), **Decision** and **Consequences**. Keep an ADR short and generic: never name a private app, its domain or its data, and say "an existing app" instead.

- **proposed** means the decision comes from a design issue that isn't agreed yet.
- **accepted** means it is agreed in the epic or settled in its issue.

## Adding or changing an ADR

1. Add or edit the file.
2. Add or update its row above.
3. Add or update its line in every knowledge skill whose area it touches:

   `- [CLA-NNNN](${CLAUDE_PLUGIN_ROOT}/adr/NNNN-slug.md) (status): one-sentence decision.`

4. Run `node tools/check-adrs.mjs`. CI runs it too. It fails when:
   - an ADR is missing from this index or from every skill;
   - a link doesn't resolve;
   - a status in an index line doesn't match the ADR.
