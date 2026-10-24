# CLA-0020: No wall-clock assertions in tests

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test that scans test assemblies (with an allowlist); reviewer
- **Issue:** #10

## Context

A rate-limiter test in an existing app asserted real elapsed time with tight bounds, and flaked under parallel load.

## Decision

- Time-dependent code takes a `TimeProvider`; tests use a fake one.
- Tests assert order and counts, not durations.
- `Stopwatch`, `DateTime.UtcNow` and `Task.Delay` don't appear in test assertions.

## Consequences

- Timing tests are deterministic and instant.
