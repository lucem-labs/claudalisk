# CLA-0038: Server state lives in TanStack Query

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend-architecture
- **Enforced by:** reviewer; lint rule against `fetch` outside `shared/api` (CLA-0014)

## Context

The UI renders what the API returns (CLA-0015), so most frontend state is a copy of server data. In the existing apps each component loads that copy itself in a `useEffect`, with its own loading flags, error handling and, in one case, about 40 lines of hand-written polling. Two components showing the same data each fetch it and can disagree.

## Decision

- Data from the API is read and written only through [TanStack Query](https://tanstack.com/query). It is the app's shared layer for server data: components subscribe to it and react when it changes.
- Each entity's `api` segment exports the query and mutation hooks for its module, such as `useOrder(id)` and `useCancelOrder()`, along with their query keys. Pages, widgets and features use those hooks.
- Components never fetch in a `useEffect` and never copy query data into `useState`.
- After a write, a mutation invalidates the queries it affects, or updates them from the response. Components don't refetch by hand.
- Polling uses the query's `refetchInterval`, which stops while the tab is hidden.
- The query client is created once in `app` and gets explicit defaults for `staleTime` and retries.

## Consequences

- Two components showing the same data share one request and one cached copy.
- Loading, error, retry, polling and cache invalidation behave the same everywhere, without hand-written code in each component.
- End-to-end tests wait for what the user sees, not for a request to finish, because cached data can appear without a new request.
