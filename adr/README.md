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
| [CLA-0005](0005-modules-expose-thin-controllers.md) | Modules may expose their own API, and controllers stay thin | accepted | backend-architecture |
| [CLA-0006](0006-architecture-tests-by-convention.md) | Architecture tests discover modules by naming convention | accepted | backend-architecture |
| [CLA-0007](0007-persistence-owns-ef-core.md) | Each module owns its schema; cross-module work uses a unit of work or the queue | accepted | data-and-migrations |
| [CLA-0008](0008-migrations-are-a-deploy-step.md) | Migrations are an explicit deploy step | accepted | data-and-migrations |
| [CLA-0009](0009-no-data-changes-at-startup.md) | No data changes at startup | accepted | data-and-migrations |
| [CLA-0010](0010-applied-migrations-are-immutable.md) | Applied migrations are never edited | accepted | data-and-migrations |
| [CLA-0011](0011-fresh-database-migrates.md) | A fresh, empty database migrates end to end | accepted | data-and-migrations |
| [CLA-0012](0012-one-off-data-fixes.md) | Data fixes are EF Core migrations | accepted | data-and-migrations |
| [CLA-0013](0013-external-data-on-explicit-trigger.md) | External data is refreshed only on an explicit trigger, and never from tests | accepted | data-and-migrations |
| [CLA-0014](0014-frontend-stack-and-api-module.md) | React, TypeScript and Vite, with every backend call through a typed API layer | accepted | frontend |
| [CLA-0015](0015-ui-renders-api-values.md) | The UI renders what the API returns and never duplicates backend rules | accepted | frontend |
| [CLA-0016](0016-every-change-ships-with-tests.md) | Every behaviour change ships with tests | accepted | testing |
| [CLA-0017](0017-tests-run-on-throwaway-stacks.md) | Tests run on throwaway stacks | accepted | testing |
| [CLA-0018](0018-real-postgres-never-skipped.md) | Persistence tests use real PostgreSQL and never skip silently | accepted | testing |
| [CLA-0019](0019-parallel-safe-tests.md) | Tests are parallel-safe | accepted | testing |
| [CLA-0020](0020-no-wall-clock-assertions.md) | No wall-clock assertions in tests | accepted | testing |
| [CLA-0021](0021-issue-driven-work.md) | All work is issue-driven | accepted | workflow |
| [CLA-0022](0022-bugs-found-become-issues.md) | Bugs found along the way become new issues | accepted | workflow |
| [CLA-0023](0023-ready-signoff-and-merge.md) | Open the pull request when CI is green and dev is verified; the owner reviews on uat and merges | accepted | workflow |
| [CLA-0024](0024-owner-merges.md) | Only the owner merges, in GitHub | accepted | workflow |
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
| [CLA-0036](0036-feature-sliced-design-pages-first.md) | The frontend follows Feature-Sliced Design, pages first | accepted | frontend |
| [CLA-0037](0037-entities-mirror-backend-modules.md) | Frontend entities mirror backend modules | accepted | frontend |
| [CLA-0038](0038-server-state-in-tanstack-query.md) | Server state lives in TanStack Query | accepted | frontend |
| [CLA-0039](0039-client-state-in-zustand-stores.md) | Shared client state lives in Zustand stores that components only subscribe to | accepted | frontend |
| [CLA-0040](0040-frontend-boundaries-linted.md) | Frontend layer boundaries are checked by Steiger in CI | accepted | frontend |
| [CLA-0041](0041-module-api-is-a-bounded-context.md) | A module's API is a bounded context that speaks its ubiquitous language | accepted | backend-architecture |
| [CLA-0042](0042-resources-are-aggregates.md) | Resources are aggregates, and read models are their own resources | accepted | backend-architecture |
| [CLA-0043](0043-state-changes-are-domain-commands.md) | State changes are domain commands, posted to a sub-resource named after the command | accepted | backend-architecture |
| [CLA-0044](0044-hypermedia-links-and-actions.md) | Representations carry links and the commands available now; the UI shows only those | accepted | backend-architecture |
| [CLA-0045](0045-http-semantics-and-problem-details.md) | The API uses HTTP's own semantics: status codes, Problem Details and conditional writes | accepted | backend-architecture |
| [CLA-0046](0046-openapi-document.md) | The OpenAPI document groups endpoints by module, and frontend API types are generated from it | accepted | backend-architecture |
| [CLA-0047](0047-modules-organized-by-feature.md) | A module's implementation is organized by feature folders | accepted | backend-architecture |
| [CLA-0048](0048-aggregates-in-a-domain-project.md) | Aggregates live in a Domain project per module, and the stores map them | accepted | backend-architecture |
| [CLA-0049](0049-features-go-through-the-dispatcher.md) | Every feature sends its commands and queries through the dispatcher | accepted | backend-architecture |
| [CLA-0050](0050-module-dependencies-go-down-feature-first.md) | Inside a module, dependencies go down and code starts in its feature | accepted | backend-architecture |
| [CLA-0051](0051-database-naming.md) | Database names are lowercase snake_case, set by convention | accepted | data-and-migrations |
| [CLA-0052](0052-cqrs-naming.md) | Commands, queries, events and their handlers follow fixed naming patterns | accepted | backend-architecture |
| [CLA-0053](0053-shadcn-ui-design-system.md) | shadcn/ui is the design system, and its components live in `shared/ui` | accepted | frontend |
| [CLA-0054](0054-tailwind-and-design-tokens.md) | Styling is Tailwind CSS v4, with design tokens as CSS variables | accepted | frontend |
| [CLA-0055](0055-claudalisk-registry-and-ai-tooling.md) | Claudalisk ships a shadcn registry, and sets up shadcn's MCP server and skill | accepted | frontend |
| [CLA-0056](0056-version-column-for-optimistic-concurrency.md) | Every aggregate root table has a version column for optimistic concurrency | accepted | data-and-migrations |
| [CLA-0057](0057-validation-fluentvalidation-and-aggregates.md) | Input shape is checked by FluentValidation validators, and domain rules by the aggregate | accepted | backend-architecture |
| [CLA-0058](0058-queued-work-jobs-library.md) | Queued work runs as jobs through the claudalisk jobs library, with a swappable transport | accepted | backend-architecture |
| [CLA-0059](0059-batch-jobs.md) | Long jobs are batch jobs that the library commits one batch at a time | accepted | backend-architecture |
| [CLA-0060](0060-jobs-router-and-job-resource.md) | The UI starts jobs through module endpoints and follows them through the jobs router | accepted | backend-architecture |
| [CLA-0061](0061-scheduler-module.md) | Recurring work comes from the claudalisk scheduler module, configured per command and module | accepted | backend-architecture |
| [CLA-0062](0062-claudalisk-nuget-packages.md) | Infrastructure ships as claudalisk NuGet packages | accepted | backend-architecture |
| [CLA-0063](0063-domain-exceptions-and-one-problem-handler.md) | Domain errors are `DomainException`s, and one API-wide handler turns every error into Problem Details | accepted | backend-architecture |
| [CLA-0064](0064-repository-and-test-layout.md) | Every app has the same repository layout, with a test project per module | accepted | backend-architecture |
| [CLA-0065](0065-frontend-tooling.md) | The frontend uses React Router 7, oxlint, Vitest and generated OpenAPI types | accepted | frontend |
| [CLA-0066](0066-environment-state-outside-the-checkout.md) | Environment files and backups live outside the checkout, per app and machine | accepted | environments |
| [CLA-0067](0067-module-contracts-are-messages-only.md) | Module contracts are messages only, sent through the dispatcher | accepted | backend-architecture |
| [CLA-0068](0068-events-fan-out-as-jobs.md) | Events fan out to every subscriber as a job after the commit | accepted | backend-architecture |
| [CLA-0069](0069-hand-written-mapping.md) | Mapping is hand-written, with no AutoMapper or other mapping library | accepted | backend-architecture |
| [CLA-0070](0070-testing-layers.md) | Each rule is tested at the lowest layer that can see it | accepted | testing |
| [CLA-0071](0071-security-scans.md) | Security scans run in CI at three levels, and every suppression expires | accepted | environments |
| [CLA-0072](0072-dependabot-updates.md) | Dependabot opens grouped dependency updates, and the owner merges them | accepted | workflow |

## Format

Each ADR is `NNNN-short-slug.md` with id `CLA-NNNN`. Ids are stable and are never reused. An ADR starts with:

```markdown
# CLA-NNNN: Decision as a sentence

- **Status:** proposed | accepted | superseded by CLA-NNNN
- **Date:** YYYY-MM-DD
- **Area:** backend-architecture | data-and-migrations | frontend | testing | workflow | environments | code-standards (cross-cutting)
- **Enforced by:** hook | test | CI | reviewer | prompt only (be specific)
- **Issue:** #n (optional)
```

Then come **Context** (optional), **Decision** and **Consequences**. Keep an ADR short and generic. Never name a private app, its domain or its data, and never cite an existing app as the reason for a decision. State the problem in general terms.

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
