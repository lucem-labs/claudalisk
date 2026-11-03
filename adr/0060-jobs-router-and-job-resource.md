# CLA-0060: The UI starts jobs through module endpoints and follows them through the jobs router

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the jobs library and its tests; API tests (a job that finds nothing still writes its result; a read model that was never computed answers `404` with its `-not-computed` problem type); end-to-end tests; reviewer
- **Issue:** #79

## Decision

- **A module endpoint starts a job.** The UI calls the module's own feature endpoint, such as `POST /api/orders/reindex` (CLA-0043, CLA-0047). The endpoint hides the queue. It returns `202 Accepted` with a `Location` header that points to the job (CLA-0045).
- **The jobs router serves every job.** The router is a module from the jobs library (CLA-0062), registered in the Host. It serves `GET /api/jobs/{module}/{id}` and `POST /api/jobs/{module}/{id}/cancel`.
  - It finds the module's job store through module registration, by the module name in the URL.
  - It reads only the standard job columns (CLA-0058). It knows nothing about what a job does.
- **The job representation is the same for every module:**
  - `status`: `queued`, `running`, `succeeded`, `failed` or `canceled`;
  - `progress`, `attempts`, and the timestamps;
  - the last error, as Problem Details (CLA-0045);
  - `_links.self`, and `_links.result` once the job has finished and set it;
  - `_actions.cancel` while the job can still be canceled (CLA-0044).
- **The result link points to the resource and always resolves.** When a job finishes, `_links.result` points to the resource it created or changed, such as `/api/orders/42`. The UI follows that link. A job that finds nothing still writes its result, empty, so the link never answers `404`.
- **A job that changes many rows links to their collection.** Its `_links.result` points to the collection, such as `/api/orders`, and its last progress step is a one-line summary, such as "Reindexed 412 orders". When a caller needs the counts as data, the job writes a small result resource instead and links to that.
- **A read model that was never computed answers `404`.** A job-computed resource, such as a deck's score, answers `GET` with `404` and a `<resource>-not-computed` problem type, such as `/problems/analysis/deck-score-not-computed` (CLA-0045). The frontend branches on that `type`. A `404` has no `_actions`, so the action that starts the computation is on the parent resource's `_actions` (CLA-0044), such as `computeScore` on the deck.
- **The frontend polls the job** with TanStack Query's `refetchInterval` until the status is final, then invalidates the queries the result affects (CLA-0038).

## Consequences

- One job component in the frontend can show any job (CLA-0055).
- A module adds background work without new status endpoints.
- The UI tells "not computed yet" from "does not exist" by the problem type alone, and finds the action that computes it on the parent.
- The router reads the jobs tables of other modules. This is the one exception to "nothing crosses a schema" (CLA-0007). It is allowed because the jobs table has the library's fixed shape and holds no business data.
