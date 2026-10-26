# CLA-0057: Input shape is checked by FluentValidation validators, and domain rules by the aggregate

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (validators live next to their message; request DTOs have no validation attributes); reviewer

## Context

Validation could happen in two places: attributes on request DTOs, which ASP.NET Core turns into a `400` by itself, or a step in the dispatcher's pipeline (CLA-0049). Commands sent from other modules never pass through a DTO, so only the pipeline step checks every command.

## Decision

- **Shape checks are FluentValidation validators.**
  - A command or query that takes input has a validator named `<Message>Validator` (CLA-0052), such as `CancelOrderCommandValidator`, in its feature folder (CLA-0047). It derives from `AbstractValidator<T>`.
  - A validator checks only the input itself: required values, lengths, formats, ranges, allowed values, and consistency between fields of the same input.
  - A validator never reads the database, calls another module or checks the state of an aggregate.
- **The pipeline runs the validators** before the unit of work (CLA-0049). A failure stops the command and returns `400` as `ValidationProblemDetails`. Its `errors` are keyed by the property names in camelCase, and these names match the request DTO's fields, so the frontend can show each error next to its field.
- **Domain rules belong to the aggregate** (CLA-0048): invariants, which commands the current state allows, uniqueness and existence. A broken rule returns `409 Conflict` with its own Problem Details `type`, and a missing resource returns `404` (CLA-0045).
- **Request DTOs have no validation attributes.** ASP.NET Core's automatic `400` covers only binding failures, such as malformed JSON or a value of the wrong type.
- FluentValidation is the only validation library. It is Apache-2.0 licensed.

## Consequences

- Commands from the HTTP API and commands from other modules are checked by the same validators.
- The line between `400` and `409` is clear: `400` means the input is malformed, `409` means the input is well formed but the domain refuses it.
- A command and its request DTO use the same property names, or the controller maps the error keys when they differ.
