# CLA-0067: Module contracts are messages only, sent through the dispatcher

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (Interfaces projects hold only messages and the module marker); reviewer

## Context

Every feature sends its commands and queries through the dispatcher (CLA-0049). A module could also keep service interfaces as facades that dispatch inside. That would make three things per operation (a method, a message and a handler), and the facade invites logic that skips the pipeline.

## Decision

- **An Interfaces project holds only messages and the module marker:** commands, queries, their results, events, and the module's empty marker class (CLA-0004). It has no service interfaces, and it references no package (CLA-0003).
- **A module calls another module only by sending that module's commands and queries through the dispatcher.** The call goes through the same pipeline as any other: logging, validation, and the caller's unit of work (CLA-0007, CLA-0049).
- **Now or later is part of the contract.** `SendAsync` always runs the target's handler and waits for it.
  - A query or command whose result is the answer, such as `GetOrderSummaryQuery` sent as `SendAsync<OrderSummaryResult>`, runs to completion.
  - A command whose result is a `JobReference`, such as `RequestReindexCommand` sent as `SendAsync<JobReference>`, means "accepted, runs later". Its handler queues an internal job (CLA-0058) and returns at once. The job's own command is internal to the module and never appears in its Interfaces project.
  - Moving an operation from immediate to background changes its result type, so callers see the change.
- **Local or remote is the Host's choice.** Each message belongs to one module, through its Interfaces assembly. Module registration records where each module runs, in-process by default. A module that moves out of process (CLA-0001) is registered with a remote transport, and the dispatcher routes its messages there. Callers do not change. The design of remote transports is left for a later ADR.

## Consequences

- Each operation is one message and one handler.
- Every cross-module call is logged, validated and joins the unit of work in the same way.
- A module's operations are found by browsing its Interfaces project, one message per file.
- A caller's tests fake `IDispatcher`, or compose the target module for real (CLA-0004).
- A remote call cannot join the caller's unit of work. Callers of a remote module switch to queued work for anything that must be atomic (CLA-0001, CLA-0007).
