# CLA-0020: No wall-clock assertions in tests

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test that scans test assemblies (with an allowlist); reviewer
- **Issue:** #10

## Context

A test that asserts real elapsed time with tight bounds, such as for a rate limiter, flakes under parallel load.

## Decision

- Time-dependent code takes a `TimeProvider`. Tests use a fake one.
- Tests assert order and counts, not durations.
- `Stopwatch`, `DateTime.UtcNow` and `Task.Delay` do not appear in test assertions.

## Consequences

- Timing tests are deterministic and instant.
