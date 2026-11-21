# CLA-0036: The frontend follows Feature-Sliced Design, pages first, and Steiger checks its boundaries in CI

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** Steiger in CI; reviewer

## Context

The backend is a modular monolith so that a vibe-coded app does not turn into spaghetti (CLA-0001). Without a matching rule in the frontend, each component fetches its own data, every backend call ends up in one API file of hundreds of lines, and components pile up flat in `src/`.

[Feature-Sliced Design](https://feature-sliced.design) (FSD) gives the frontend the same kind of boundaries: layers that import only downward, and slices with a public API. Applied mechanically, it is heavy for small apps, because a small change can touch five layers. "Pages first" keeps the boundaries and removes that cost.

## Decision

- `frontend/src` is split into FSD v2.1 layers, from top to bottom:
  - `app`: the entry point, routing, providers and global styles;
  - `pages`: one slice per route;
  - `widgets`: large, self-contained blocks of UI that more than one page uses;
  - `features`: user actions that more than one page uses, such as "add to cart" or "import a file";
  - `entities`: the business data the app works with, one slice per backend module (CLA-0037);
  - `shared`: code with no business meaning, such as the HTTP client, UI primitives and helpers.
- Each slice is split into segments by purpose: `ui`, `api`, `model` and `lib`. A slice creates only the segments it needs.
- **Imports go only downward.** Code may import from layers below its own, never from its own layer or above. Slices on the same layer do not import each other. The one exception is between entities, through an explicit `@x` cross-reference, such as `entities/order/@x/customer.ts`.
- **Each slice has a public API.** Other slices import only from its `index.ts`, never from files inside it.
- **Pages first.** New code starts in the page that needs it. It moves down to a widget, feature or entity only when a second page needs it. Never create a slice for code used in only one place. Entity slices are the exception: an entity slice exists from the first use of its backend module, because it mirrors that module (CLA-0037).
- `app` and `shared` have no slices, and their segments may import each other.
- **[Steiger](https://github.com/feature-sliced/steiger), the official FSD linter, runs over `frontend/src` as a CI job** next to oxlint (CLA-0014). An error fails CI. It catches imports that go up a layer or across slices, imports that skip a public API, and slices or segments in the wrong place.
- **`fsd/insignificant-slice` is off for `entities`.** The template's Steiger config turns it off there, because the rule flags a slice that only one page or feature uses, and an entity slice exists from its module's first use. It stays on for every other layer, where it enforces pages first.
- **`fsd/inconsistent-naming` stays on.** It needs the slices on a layer to be all singular or all plural, and entity slices take the singular module names (CLA-0001). An app whose entity slices fail it renames the module. Until the rename lands, the app may turn the rule off for `entities` only, as a deviation that names the rename issue (CLA-0028). Any other rule an app turns off is turned off in the Steiger config and listed in `AGENTS.md`.

## Consequences

- Every piece of frontend code has a place to live, and the place shows who may use it.
- Small apps stay mostly `app`, `pages`, `entities` and `shared`. `widgets` and `features` appear only when code is reused.
- Moving code down a layer is a normal refactor that comes with the second use. Do not plan it in advance.
- The boundaries do not depend on a reviewer noticing a bad import, as the backend's do not (CLA-0006).
