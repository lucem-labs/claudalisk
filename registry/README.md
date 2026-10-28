# The @claudalisk registry

A [shadcn registry](https://ui.shadcn.com/docs/registry) with claudalisk's theme and the base components every app needs ([CLA-0055](../adr/0055-claudalisk-registry-and-ai-tooling.md)).

| Item | Installs | What it is |
|---|---|---|
| `theme` | `src/app/styles/theme.css` | The design tokens, light and dark ([CLA-0054](../adr/0054-tailwind-and-design-tokens.md)) |
| `problem-details` | `shared/lib/problem-details.ts` | Problem Details types, `ProblemError` and the validation errors of a field |
| `hypermedia` | `shared/lib/hypermedia.ts`, `shared/api/hypermedia.ts` | `_links` and `_actions` types; `followLink` and `sendAction` |
| `problem-field` | `shared/ui/problem-field.tsx` | A form field that shows its validation errors |
| `problem-alert` | `shared/ui/problem-alert.tsx` | The title, detail and unshown validation errors of a problem |
| `action-button` | `shared/ui/action-button.tsx` | A button shown only when its action is in `_actions` |
| `paged-table` | `shared/ui/paged-table.tsx` | A TanStack Table that pages by `next` and `prev` links |
| `query-state` | `shared/ui/query-state.tsx` | Loading, error and empty states for a query |
| `app-shell` | `shared/ui/app-shell.tsx` | The sidebar, header and main area |
| `base` | all of the above | What a new app starts with |

## Using it in an app

```bash
node <claudalisk>/tools/add-design-system.mjs --app frontend
```

This writes `components.json`, runs `shadcn add @claudalisk/base` and adds shadcn's skill. The app needs a Vite, React and Tailwind v4 frontend with the `@/*` alias for `src/*`. After that, add components with the shadcn CLI or its MCP server, which the plugin configures.

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
