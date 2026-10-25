# Architecture decision records

These are claudalisk's standards for the apps it builds. Each ADR is written once here. The knowledge skills in [`skills/`](../skills) index the ADRs for their area and link to them through `${CLAUDE_PLUGIN_ROOT}/adr/…`. Claude loads an ADR only when the work needs it. A skill with `paths` loads when Claude works with matching files.

An app's `AGENTS.md` wins where it differs. It lists each deliberate deviation by ADR id ([CLA-0028](0028-app-agents-md-wins.md)).

## Index

| ADR | Decision | Status | Area |
|---|---|---|---|
| [CLA-0001](0001-modular-monolith.md) | The backend is a modular monolith | accepted | backend-architecture |
| [CLA-0002](0002-interfaces-projects.md) | Modules are referenced only through their Interfaces projects | accepted | backend-architecture |
| [CLA-0003](0003-lean-interfaces-projects.md) | Interfaces projects are lean, and pass messages that are POCOs | accepted | backend-architecture |
| [CLA-0004](0004-module-registration.md) | Module registration is idempotent and declares dependencies | accepted | backend-architecture |
| [CLA-0005](0005-thin-controllers-and-mapping.md) | Modules may expose their own API; controllers stay thin; mapping is internal extension methods | accepted | backend-architecture |
| [CLA-0006](0006-architecture-tests-by-convention.md) | Architecture tests discover modules by naming convention | proposed | backend-architecture |
| [CLA-0007](0007-persistence-owns-ef-core.md) | Each module owns its schema; cross-module work uses a unit of work or the queue | accepted | data-and-migrations |
| [CLA-0008](0008-migrations-are-a-deploy-step.md) | Migrations are an explicit deploy step | accepted | data-and-migrations |
| [CLA-0009](0009-no-data-changes-at-startup.md) | No data changes at startup | accepted | data-and-migrations |
| [CLA-0010](0010-applied-migrations-are-immutable.md) | Applied migrations are never edited | accepted | data-and-migrations |
| [CLA-0011](0011-fresh-database-migrates.md) | A fresh, empty database migrates end to end | proposed | data-and-migrations |
| [CLA-0012](0012-one-off-data-fixes.md) | Data fixes are EF Core migrations | accepted | data-and-migrations |
| [CLA-0013](0013-external-data-on-explicit-trigger.md) | External data is refreshed only on an explicit trigger, and never from tests | proposed | data-and-migrations |
| [CLA-0014](0014-frontend-stack-and-api-module.md) | React, TypeScript and Vite, with every backend call through a typed API layer | accepted | frontend-conventions |
| [CLA-0015](0015-ui-renders-api-values.md) | The UI renders what the API returns and never duplicates backend rules | accepted | frontend-conventions |
| [CLA-0016](0016-every-change-ships-with-tests.md) | Every behaviour change ships with tests | accepted | testing |
| [CLA-0017](0017-tests-run-on-throwaway-stacks.md) | Tests run on throwaway stacks | accepted | testing |
| [CLA-0018](0018-real-postgres-never-skipped.md) | Persistence tests use real PostgreSQL and never skip silently | proposed | testing |
| [CLA-0019](0019-parallel-safe-tests.md) | Tests are parallel-safe | proposed | testing |
| [CLA-0020](0020-no-wall-clock-assertions.md) | No wall-clock assertions in tests | proposed | testing |
| [CLA-0021](0021-issue-driven-work.md) | All work is issue-driven | accepted | workflow |
| [CLA-0022](0022-bugs-found-become-issues.md) | Bugs found along the way become new issues | accepted | workflow |
| [CLA-0023](0023-ready-signoff-and-merge.md) | Open the pull request when CI is green and dev is verified; the owner reviews on uat and merges | accepted | workflow |
| [CLA-0024](0024-owner-merges.md) | Only the owner merges, in GitHub | accepted | workflow |
| [CLA-0025](0025-stacked-pull-requests.md) | Stacked pull requests merge in order without closing children | proposed | workflow |
| [CLA-0026](0026-no-real-data-or-secrets-in-git.md) | Real data and secrets never go into commits, pull requests or issues | accepted | workflow |
| [CLA-0027](0027-scripts-in-node.md) | Scripts are written in Node.js | accepted | code-standards |
| [CLA-0028](0028-app-agents-md-wins.md) | The app's AGENTS.md wins, and deviations cite ADR ids | accepted | workflow |
| [CLA-0029](0029-dev-and-uat-environments.md) | Two local environments: dev for the agent, uat for the owner's real data | accepted | environments |
| [CLA-0030](0030-cd-deploys-dev-and-uat.md) | CD deploys dev and uat together, backing up uat first | accepted | environments |
| [CLA-0031](0031-backups-and-restores.md) | Uat backups are versioned; restores are verified and swapped in | accepted | environments |
| [CLA-0032](0032-dev-refreshed-from-uat.md) | Dev is refreshed one way from uat | accepted | environments |
| [CLA-0033](0033-shared-machine-infrastructure.md) | The proxy and CI runners are shared by every app on the machine | accepted | environments |
| [CLA-0034](0034-ci-workflow.md) | CI runs once per pushed commit, fully parallel | accepted | environments |
| [CLA-0035](0035-no-code-comments.md) | Code carries no comments | accepted | code-standards |
| [CLA-0036](0036-feature-sliced-design-pages-first.md) | The frontend follows Feature-Sliced Design, pages first | proposed | frontend-architecture |
| [CLA-0037](0037-entities-mirror-backend-modules.md) | Frontend entities mirror backend modules | proposed | frontend-architecture |
| [CLA-0038](0038-server-state-in-tanstack-query.md) | Server state lives in TanStack Query | proposed | frontend-architecture |
| [CLA-0039](0039-client-state-in-zustand-stores.md) | Shared client state lives in Zustand stores that components only subscribe to | proposed | frontend-architecture |
| [CLA-0040](0040-frontend-boundaries-linted.md) | Frontend layer boundaries are checked by Steiger in CI | proposed | frontend-architecture |
| [CLA-0041](0041-module-api-is-a-bounded-context.md) | A module's API is a bounded context that speaks its ubiquitous language | proposed | backend-architecture |
| [CLA-0042](0042-resources-are-aggregates.md) | Resources are aggregates, and read models are their own resources | proposed | backend-architecture |
| [CLA-0043](0043-state-changes-are-domain-commands.md) | State changes are domain commands, posted to a sub-resource named after the command | proposed | backend-architecture |
| [CLA-0044](0044-hypermedia-links-and-actions.md) | Representations carry links and the commands available now; the UI shows only those | proposed | backend-architecture |
| [CLA-0045](0045-http-semantics-and-problem-details.md) | The API uses HTTP's own semantics: status codes, Problem Details and conditional writes | proposed | backend-architecture |
| [CLA-0046](0046-openapi-document.md) | The OpenAPI document groups endpoints by module, and frontend API types are generated from it | proposed | backend-architecture |
| [CLA-0047](0047-modules-organized-by-feature.md) | A module's implementation is organized by feature folders | proposed | backend-architecture |
| [CLA-0048](0048-aggregates-in-a-domain-project.md) | Aggregates live in a Domain project per module, and the stores map them | proposed | backend-architecture |
| [CLA-0049](0049-features-go-through-the-dispatcher.md) | Every feature sends its commands and queries through the dispatcher | proposed | backend-architecture |
| [CLA-0050](0050-module-dependencies-go-down-feature-first.md) | Inside a module, dependencies go down and code starts in its feature | proposed | backend-architecture |
| [CLA-0051](0051-database-naming.md) | Database names are lowercase snake_case, set by convention | proposed | data-and-migrations |
| [CLA-0052](0052-cqrs-naming.md) | Commands, queries, events and their handlers follow fixed naming patterns | proposed | backend-architecture |
| [CLA-0053](0053-shadcn-ui-design-system.md) | shadcn/ui is the design system, and its components live in `shared/ui` | proposed | frontend-conventions |
| [CLA-0054](0054-tailwind-and-design-tokens.md) | Styling is Tailwind CSS v4, with design tokens as CSS variables | proposed | frontend-conventions |
| [CLA-0055](0055-claudalisk-registry-and-ai-tooling.md) | Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill | proposed | frontend-conventions |
| [CLA-0056](0056-version-column-for-optimistic-concurrency.md) | Every aggregate root table has a version column for optimistic concurrency | proposed | data-and-migrations |
| [CLA-0057](0057-validation-fluentvalidation-and-aggregates.md) | Input shape is checked by FluentValidation validators, and domain rules by the aggregate | proposed | backend-architecture |

## Format

Each ADR is `NNNN-short-slug.md` with id `CLA-NNNN`. Ids are stable and are never reused. An ADR starts with:

```markdown
# CLA-NNNN: Decision as a sentence

- **Status:** proposed | accepted | superseded by CLA-NNNN
- **Date:** YYYY-MM-DD
- **Area:** backend-architecture | data-and-migrations | frontend-architecture | frontend-conventions | testing | workflow | environments | code-standards (cross-cutting)
- **Enforced by:** hook | test | CI | reviewer | prompt only (be specific)
- **Issue:** #n (optional)
```

Then come **Context** (optional), **Decision** and **Consequences**. Keep an ADR short and generic. Never name a private app, its domain or its data. Say "an existing app" instead.

- **proposed**: the decision comes from a design issue that is not agreed yet.
- **accepted**: the epic or the issue settles the decision.

## Adding or changing an ADR

1. Add or edit the file.
2. Add or update its row above.
3. Add or update its line in every knowledge skill whose area it touches:

   `- [CLA-NNNN](${CLAUDE_PLUGIN_ROOT}/adr/NNNN-slug.md) (status): one-sentence decision.`

4. Run `node tools/check-adrs.mjs`. CI runs it too. It fails when:
   - an ADR is missing from this index or from every skill;
   - a link does not resolve;
   - a status in an index line does not match the ADR.
