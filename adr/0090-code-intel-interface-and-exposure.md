# CLA-0090: Sessions carry no code-intelligence tools by default, and a role that needs them gets one MCP tool

- **Status:** accepted
- **Date:** 2026-11-16
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); from #209 on, the app template's agent tool lists and their tests
- **Issue:** #205, #202

## Context

CLA-0089's host answers the N, E and D rows of CLA-0088 for C# and TypeScript. An agent can reach it through three interfaces, each exposed two ways:

1. **A, positions:** one tool per operation, addressed by file, line and column, as the servers take them.
2. **B, symbol names:** N6 search, then N1 to N4 by name, with N2 references grouped by file and stable across calls, E1 rename and E4 replace body by name, and D2 diagnostics, in compact text.
3. **C, a snippet:** one tool that runs a JavaScript snippet against the same operations, in a locked-down `vm` with no file system, network or process, and a time limit. A read-only variant drops the edit operations.

Each is a stdio MCP server and a CLI. The schema each puts in context:

| Interface | MCP tools | MCP schema, estimated tokens | CLI skill text, estimated tokens |
|---|---|---|---|
| A | 8 | 774 | 132 |
| B | 9 | 776 | 136 |
| C | 1 | 140 | 161 |

MCP prompts once per tool and is silenced by one allow rule per server. The CLI prompts once per distinct command, so it needs a pattern rule, and keeping a read-only agent read-only needs a PreToolUse hook on its shell.

Each pair ran in the #202 harness as an arm with the claudalisk plugin, `--setting-sources project,local`, on Sonnet 5.5 and Opus 5.5. The scout got only the read-only operations and the implementer all of them. Every arm ran 2 repeats against the baseline's 3, so the noise rule reports insufficient data for each: the numbers give a direction. Wall time is left out because the machine was shared.

- **Fixture, T1 to T6, 144 arm runs, all passed, as did the baseline:**

  | Arm | Sonnet cost per run | Opus cost per run | Calls per run, Sonnet / Opus |
  |---|---|---|---|
  | baseline | $0.11 | $0.26 | – |
  | A, MCP | $0.13 | $0.30 | 0.8 / 0.3 |
  | A, CLI | $0.13 | $0.31 | 0.7 / 0.2 |
  | B, MCP | $0.14 | $0.30 | 0.6 / 0.8 |
  | B, CLI | $0.13 | $0.30 | 1.8 / 0.4 |
  | C, MCP | $0.13 | $0.27 | 0.1 / 0.2 |
  | C, CLI | $0.13 | $0.31 | 0.3 / 0.1 |

  Turns matched the baseline. Cache read rose 50 to 70 percent: the extra cost is carrying the tools and their notes, not calling them.
- **Private pack, 8 tasks from real apps, B over MCP only:** Sonnet cost $0.20 per run against $0.20, with 16 of 16 passed against 23 of 24. Opus cost $0.47 against $0.43, with 14 of 14 passed against 24 of 24. Calls were 0.9 and 0.5 per run. The owner stopped the pass there, since no arm had saved anything.
- **CLI scouts:** the hook denied Opus scouts' other shell commands more often than it allowed their CLI calls, 9 denials to 5 across the three CLI arms. Sonnet scouts mostly ran the CLI as told.
- **Code Mode** runs only in the interactive terminal, so CLA-0088's surface rule keeps the snippet interface C as claudalisk's own. Whether Code Mode can call MCP tools is not known, and nothing here depends on it.

## Decision

- **No code-intelligence tools in a session by default.** Neither the main thread, the scout nor the implementer carries A, B or C. No arm saved cost, turns or failures on either model, and every arm cost more on the fixture. The host's value stays where it costs no schema: D1 through the PostToolUse hook of CLA-0092, and the host's use from scripts.
- **A role that needs them gets interface C over MCP.** Cost tracked the schema in context, and C over MCP is the smallest, one tool of about 140 tokens, and the arm closest to the baseline, one cent above it on Opus. A role is the scout, the implementer or the main thread; which one, if any, is #206's question, and it reuses this spike's benchmark arms.
- **A read-only role gets the read-only server.** It has no rename and no replaceBody, so read-only holds without a hook.
- **MCP over the CLI.** The CLI costs the same, but each distinct command prompts, and a read-only agent needs a shell hook that Opus scouts keep tripping.
- **Symbol names over positions inside C.** Positions and names cost the same. Agents hold names, and a position goes stale after an edit.
- **Agent tool lists change only in #209.** The arms override the scout's and implementer's tool lists in their run copies. The template's lists stay as CLA-0080 has them until #209, and change only if #206 finds a role where the tools pay.

## Consequences

- Sessions keep today's cost. The interfaces, their servers and their tests stay with the spike, so #206 can measure a role without rebuilding them.
- A future server or model can change the answer. The arms, the schema table and the private pack rerun it; three repeats per side would give a verdict.
- The snippet sandbox is claudalisk code with its own tests. If #206 ships C, its limits (no file system, network or process, and the time limit) become a guarantee, and its tests move into CI on three OSes with the shipped tool.
- This amends CLA-0092's line that the scout gets references from the host's tools: it does so only if #206 finds that it pays. Until then the scout keeps finding references as CLA-0080 has it.
