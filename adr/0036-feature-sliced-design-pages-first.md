# CLA-0036: The frontend follows Feature-Sliced Design, pages first

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** Steiger in CI (CLA-0040), reviewer

## Context

The backend is a modular monolith so that a vibe-coded app does not turn into spaghetti (CLA-0001). The frontend had no matching rule. Without one, each component fetches its own data, every backend call ends up in one API file of hundreds of lines, and components pile up flat in `src/`.

[Feature-Sliced Design](https://feature-sliced.design) (FSD) gives the frontend the same kind of boundaries: layers that import only downward, and slices with a public API. Applied mechanically, it is heavy for small apps because a small change can touch five layers. "Pages first" keeps the boundaries and removes that cost.

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

## Consequences

- Every piece of frontend code has a place to live, and the place shows who may use it.
- Small apps stay mostly `app`, `pages`, `entities` and `shared`. `widgets` and `features` appear only when code is reused.
- Moving code down a layer is a normal refactor that comes with the second use. Do not plan it in advance.
- This structure replaces the flat `pages/`, `components/` and `lib/` layout that #21 first suggested.
