# CLA-0038: Server state lives in TanStack Query

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** reviewer; lint rule against `fetch` outside `shared/api` (CLA-0014)

## Context

The UI renders what the API returns (CLA-0015), so most frontend state is a copy of server data. In the existing apps, each component loads that copy in a `useEffect`, with its own loading flags and error handling. One app has about 40 lines of hand-written polling. Two components that show the same data each fetch it and can disagree.

## Decision

- Read and write API data only through [TanStack Query](https://tanstack.com/query). It is the app's shared layer for server data. Components subscribe to it and react when it changes.
- Each entity's `api` segment exports the query and mutation hooks for its module, such as `useOrder(id)` and `useCancelOrder()`, with their query keys. Pages, widgets and features use those hooks.
- Components never fetch in a `useEffect` and never copy query data into `useState`.
- After a write, a mutation invalidates the queries it affects, or updates them from the response. Components do not refetch by hand.
- Polling uses the query's `refetchInterval`, which stops while the tab is hidden.
- The app creates the query client once in `app`, with explicit defaults for `staleTime` and retries.

## Consequences

- Two components that show the same data share one request and one cached copy.
- Loading, error, retry, polling and cache invalidation behave the same everywhere. No component needs hand-written code for them.
- End-to-end tests wait for what the user sees, not for a request to finish. Cached data can appear without a new request.
