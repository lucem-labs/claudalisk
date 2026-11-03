# The @claudalisk registry

A [shadcn registry](https://ui.shadcn.com/docs/registry) with claudalisk's theme and the base components every app needs ([CLA-0055](../adr/0055-claudalisk-registry-and-ai-tooling.md)).

| Item | Installs | What it is |
|---|---|---|
| `theme` | `src/app/styles/theme.css` | The design tokens, light and dark, including `success` and `warning` ([CLA-0054](../adr/0054-tailwind-and-design-tokens.md)) |
| `problem-details` | `shared/lib/problem-details.ts` | Problem Details types, `ProblemError`, `problemMessage` (the `detail`, else the first field error, else the `title`) and the validation errors of a field, matched by key whatever its case or `$.` prefix |
| `hypermedia` | `shared/lib/hypermedia.ts`, `shared/api/hypermedia.ts` | `_links` and `_actions` types; `followLink` and `sendAction` |
| `problem-field` | `shared/ui/problem-field.tsx` | A form field that shows its validation errors |
| `problem-alert` | `shared/ui/problem-alert.tsx` | The title, detail and validation errors of a problem, without those the form's `fields` show. Since 0.2.0 it lists every field error when `fields` is left out, so a form that shows its errors with `problem-field` passes `fields` |
| `action-button` | `shared/ui/action-button.tsx` | A button shown only when its action is in `_actions` |
| `paged-table` | `shared/ui/paged-table.tsx` | A TanStack Table that pages by `next` and `prev` links; `stacked` labels each cell with its column header |
| `query-state` | `shared/ui/query-state.tsx` | Loading, error and empty states for a query |
| `app-shell` | `shared/ui/app-shell.tsx` | The sidebar, header and main area |
| `job` | `shared/lib/job.ts`, `shared/api/job.ts`, `shared/ui/job-panel.tsx` | The job resource's types; `useJob`, which polls a job until it ends and follows the newest active job when a newer one supersedes it; `JobPanel`, which shows its status, progress, error and cancel action |
| `table` | `shared/ui/table.tsx` | shadcn's table, with a `stacked` variant that turns rows into cards labelled by each cell's `data-label` when its container is narrower than 28rem, and gives the parts explicit table roles so screen readers keep them. Each stacked cell holds one element or plain text |
| `badge` | `shared/ui/badge.tsx` | shadcn's badge, with `success` and `warning` variants |
| `heading` | `shared/ui/heading.tsx` | `Heading`, a real `h1` to `h4`, and `PageHeader`, a page's `h1` with its description and actions |
| `section-card` | `shared/ui/section-card.tsx` | A card with a real heading, which is a region named by that heading with `region` |
| `disclosure` | `shared/ui/disclosure.tsx` | A collapsible section opened by a button with a chevron, in place of `<details>` |
| `pager` | `shared/ui/pager.tsx` | Previous and next buttons with an optional page count, for lists that are not tables |
| `base` | all of the above | What a new app starts with |

## Using it in an app

```bash
node <claudalisk>/tools/add-design-system.mjs --app frontend
```

This fetches shadcn's skill, writes `components.json`, runs `shadcn add @claudalisk/base`, removes the comments shadcn's components ship with and writes the skill to `.claude/skills/shadcn`. The app needs a Vite, React and Tailwind v4 frontend with TypeScript installed and the `@/*` alias for `src/*`. After that, add components with the shadcn CLI or its MCP server, which the plugin configures.

- The skill comes from GitHub's API, with `GITHUB_TOKEN` or else `gh auth token`. It is fetched before anything is written, so a refused request leaves the app as it was. If the skill is missing from an app that already has `components.json`, add it with `--skill-only`.
- After a later `shadcn add` or an upstream fix, remove the new comments with `node <claudalisk>/tools/strip-comments.mjs --app frontend`. It removes the comments in the `.ts` and `.tsx` files under `src/shared`, or the paths given after the folder, and keeps lint and compiler directives.
- `table` and `badge` replace shadcn's files of the same names. Update them with `shadcn add @claudalisk/table` or `@claudalisk/badge`. The CLI skips an existing file unless told to overwrite it, so never pass `--overwrite` to an add of shadcn's own `table` or `badge`, and never apply a `shadcn diff` of them against `@shadcn`.
- Copy [`templates/app/frontend/.oxlintrc.json`](../templates/app/frontend/.oxlintrc.json) into the frontend. It turns `react/only-export-components` off in `src/shared/ui`, where shadcn exports variants beside its components.

### Following a job

`useJob(link, options)` polls the job at `link` until it ends, then invalidates `options.invalidates` once for its cache entry, so they are invalidated again only after that entry has been dropped and the job is loaded anew. A page that starts a job by itself, such as a panel that computes a score, can find its job replaced by a newer one with the same dedupe key; the old one ends `canceled` with the problem type `/problems/jobs/superseded`. Give such a page `findActive`, which returns the link of the newest active job of the same kind and input from the module's own endpoints, and `start`, which starts a new one. The hook follows the job `findActive` finds and calls `start` only when it finds none, at most once for each superseded job, even when the query retries or refetches. In another tab, `findActive` finds the job this tab started, so two tabs never keep replacing each other's job. It follows up to three replacements in one poll. Without these options, the panel shows the superseded job as canceled. `followLink` and `sendAction` refuse a link to another origin.

## Moving an existing app onto it

An app with its own global stylesheet moves in steps, and every page keeps working in between:

1. **Put the old stylesheet in `@layer base`.** Tailwind's utilities are in `@layer utilities`, so they then beat the old rules, and the shadcn components look right.
2. **Rename the old variables to `--legacy-*` and point them at the tokens.** Old names such as `--border`, `--muted` and `--accent` clash with the tokens and can mean something else: an old `--muted` may be a text colour, where the token is a background. Map each one by meaning, such as `--legacy-muted: var(--muted-foreground)`. The old pages then follow dark mode too.
3. **Scope the old element rules to `:not(:where([data-slot]))`**, such as `button:not(:where([data-slot]))`. shadcn's components carry `data-slot`, so the old rules no longer touch them, and `:where` adds no specificity, so the old class rules still beat the old element rules.
4. **Restyle page by page, then delete the stylesheet.** Until it is gone, the app's `AGENTS.md` lists it as a deviation from CLA-0053 and CLA-0054 and names the issue that deletes it.

## Changing it

- Sources are in `theme/`, `lib/`, `api/` and `ui/`, and `registry.json` lists them. Write imports the shadcn way (`@/components/ui/button`, `@/lib/problem-details`); the CLI rewrites them to the app's aliases.
- Rebuild the served JSON and commit it:
  ```bash
  npx shadcn@<version in .mcp.json> build registry.json --output public/r
  ```
- Run the checks that CI runs. They build and install the registry into `fixture-app`, then type-check, build and test it:
  ```bash
  node tools/check-registry.mjs
  ```
- Tests for the components go in `fixture-app/src`, next to where the item installs.
- Apps get a change at the next release: bump `version` in `.claude-plugin/plugin.json`, and the owner tags `v<version>` after merging.
