# CLA-0043: State changes are domain commands, posted to a sub-resource named after the command

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer

## Decision

- A change with meaning in the domain is a command. Clients `POST` it to a sub-resource of the aggregate, named exactly as the command in the ubiquitous language: `POST /api/orders/{id}/cancel`, `POST /api/orders/{id}/ship`.
- The request body holds only the command's own input, such as a reason or a date. It never holds the aggregate's new state.
- The aggregate checks its rules. It either applies the command or refuses it with a Problem Details response (CLA-0045).
- A status field is never changed through `PUT` or `PATCH`. "Cancelled" is reached by cancelling, not by writing `"status": "cancelled"`.
- A command that previews its effect without applying it is a separate sub-resource, such as `POST /api/orders/{id}/cancel/preview`, and changes nothing.
- A command that starts queued work returns `202 Accepted` and a `Location` header that points to the job at `/api/jobs/{module}/{id}` (CLA-0045, CLA-0060).
- Command routes are verbs. All other routes are nouns.

## Consequences

- Each command is one controller action that calls one domain operation. This keeps controllers thin (CLA-0005).
- The available commands are the ones the aggregate can accept or refuse, so the server can list them in each representation (CLA-0044).
- `PUT` and `PATCH` stay simple because they never carry business rules.
