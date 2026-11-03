# CLA-0061: Recurring work comes from the claudalisk scheduler module, configured per command and module

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the scheduler library and its tests; reviewer
- **Issue:** #84

## Context

Recurring workers on timers, written separately in each app, repeat the same code with its own bugs. Recurring work needs one shared, tested way to run.

## Decision

- **The scheduler is a module from the claudalisk packages** (CLA-0062). An app registers it in the Host.
- **A schedule has three parts:** a cron expression, a command (CLA-0052) and the module that receives it.
- **When a schedule fires, the scheduler sends the command through the dispatcher** to that module (CLA-0049). The module's contract declares the command.
- **A schedulable command returns `JobReference`** (CLA-0067). Its handler queues a job (CLA-0058) and returns at once, so the scheduler's tick stays short and the work gets the job's retries and progress.
- **Each schedule fires once per scheduled time,** even with several app instances. The scheduler stores each schedule's last fire time in its own schema and takes a row lock before it fires.
- **The owner configures schedules.** In v1, an environment's schedules live in its own env file (CLA-0066), which the deploy passes to the API container. The checkout holds none. In v2, registering the scheduler module also adds a UI where the owner edits schedules.
- **A schedule the owner configured counts as an explicit owner trigger,** so it may refresh third-party data (CLA-0013). Tests and CI still never call live third-party APIs.
- **A scheduled data refresh takes no backup of its own.** On uat it relies on the regular uat backups (CLA-0031).
- Schedules never run in tests unless a test turns them on.

## Consequences

- Apps stop writing timer-driven background services.
- The scheduler depends only on the dispatcher. It knows the commands it sends, not the logic behind them.
- A scheduled run is visible like any other job.
- dev and uat can run different schedules, and changing one needs no commit, only a redeploy that passes the new env file.
- A refresh that goes wrong on uat is undone by the owner's restore of the last backup, which also loses the data entered after it.
