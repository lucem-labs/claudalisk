# CLA-0095: No tool-output compression, because the output it could filter is a small share of context

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023): a change that adds a tool-output filter, or a `PostToolUse` hook that rewrites tool output, must cite a later ADR that amends this one
- **Issue:** #212, #200

## Context

A `PostToolUse` hook could return `updatedToolOutput` with deterministic filters for build, test, lint, git and CI output, and keep the original where the agent can read it. `verify.mjs` already does this for CI: it prints only the failures, capped at about 4 KB, and keeps the full logs outside the checkout (CLA-0076).

#212 measured every transcript on the owner's machine from 2026-10-10 to 2026-11-15: 52,745 model requests and 70,419 tool results. Each result counted for every request it stayed in the context. The table by tool and command family is on the issue. The analysis scripts stay private, because most of the transcripts come from private repositories.

## Decision

- **No tool-output compression.** No hook rewrites tool output, and the plugin ships no per-command filters.
  - Build, test, lint, CI, Docker and git output is 4.4% of context and 3.5% of cost. Halving all of it would save about 2% of context, which is less than the benchmark of #202 can tell from noise. Each tool call would also pay for a Node process.
  - Claude Code and other plugins already truncate long output. One truncated result in four was followed by a re-run or a read of the full output, so a filter costs more than its output size shows.
  - File reads and search are 31% of context. Compressing them would change the evidence the agent asked for (CLA-0088). The read rules (CLA-0078) and the scout (CLA-0080) deal with that cost.
- **`verify.mjs` stays the one compaction for CI output** (CLA-0076).
- **What reopens it:** a spike by the same method that finds this output above 10% of context, or a benchmark that finds rework caused by it. A design would then:
  - use `PostToolUse` with `updatedToolOutput`;
  - use deterministic filters only;
  - never return more than the original;
  - keep the original outside the checkout.

## Consequences

- No hook runs on each tool call, and no filter list has to keep up with new versions of `dotnet`, `npm` or `gh`.
- Agents keep seeing the full build, test and git output.
