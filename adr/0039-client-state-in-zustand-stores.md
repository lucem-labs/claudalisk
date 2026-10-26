# CLA-0039: Shared client state lives in Zustand stores that components only subscribe to

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer

## Decision

- State that never comes from the API, such as a selection, an open panel, a draft in progress or a preference, lives in one of three places:
  - **`useState`**, when one component owns it;
  - **the URL**, for filters, sorting, tabs and other view state that must survive a reload or work as a shared link;
  - **a [Zustand](https://zustand.docs.pmnd.rs) store**, when components that share no parent, or are far apart, need it.
- A store lives in the `model` segment of the slice that owns it (CLA-0036). It holds the state and the actions that change it.
- **Components only subscribe.** They read through a selector, such as `useCheckoutDraft((s) => s.lines)`, and change state only by calling the store's actions. They do not change the store's state directly and do not copy it into `useState`.
- A store never holds data from the API. That data belongs to TanStack Query (CLA-0038). A store holds at most the ids it needs to find that data.
- Business rules stay in the backend (CLA-0015). A store action may decide UI behaviour, never a business result.

## Consequences

- A component re-renders only when the part of the store it selects changes.
- The store's actions define once how shared client state changes. Every component that uses it follows the same rules.
- There is no single global store. Each store belongs to one slice and follows that slice's import rules.
