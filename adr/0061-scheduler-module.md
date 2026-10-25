# CLA-0061: Recurring work comes from the claudalisk scheduler module, configured per command and module

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the scheduler library and its tests; reviewer

## Context

Both existing apps have recurring workers on timers, written separately in each app. Recurring work needs one shared, tested way to run.

## Decision

- **The scheduler is a module from the claudalisk packages** (CLA-0062). An app registers it in the Host.
- **A schedule has three parts:** a cron expression, a command (CLA-0052) and the module that receives it.
- **When a schedule fires, the scheduler sends the command through the dispatcher** to that module (CLA-0049). The module's contract declares the command. The module decides whether to run it at once or as a job (CLA-0058).
- **Each schedule fires once per scheduled time,** even with several app instances. The scheduler stores each schedule's last fire time in its own schema and takes a row lock before it fires.
- **The owner configures schedules.** In v1, schedules come from configuration. In v2, registering the scheduler module also adds a UI where the owner edits schedules.
- **A schedule the owner configured counts as an explicit owner trigger,** so it may refresh third-party data (CLA-0013). Tests and CI still never call live third-party APIs.
- Schedules never run in tests unless a test turns them on.

## Consequences

- Apps stop writing timer-driven background services.
- The scheduler depends only on the dispatcher. It knows the commands it sends, not the logic behind them.
- A scheduled run is visible like any other command or job.
