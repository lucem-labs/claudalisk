# CLA-0094: No loop guard, because agent loops cost about half a percent of spend

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); CLA-0088 requires a new transcript spike before any loop guard is built
- **Issue:** #211, #200

## Context

An agent can loop: it runs the same failing command again without changing anything, it runs CI again and gets the same failure, or it edits the same lines back and forth. Every turn in such a loop resends the whole conversation (CLA-0073), so a loop can be expensive. A loop guard would watch tool calls and tell the agent when it is stuck. Issue #211 links a reference design. It waits for 18 turns plus a repeated failure, or for 8 error outputs, and calls an agent stuck only when churn, noise and stagnation appear together.

CLA-0088 allows a loop guard only if a transcript spike first shows that the waste exists, as #146 did for repeat reads. Issue #211 is that spike.

The spike read every Claude Code transcript on the owner's machine, from 2026-10-10 to 2026-11-15: 200 main-thread transcripts (72 compactions) and 1,027 subagent transcripts, from this repository and from private apps. The Desktop app keeps no separate copy of them: its redirected cache folder holds only MCP debug logs. Forked and resumed transcripts repeat their parent's messages, so each message and tool call was counted once. Cost is list price from each message's `usage`, cache writes and reads included. A run counts as a loop only when no human prompt arrived inside it, because a change the owner asked for is not a loop. The per-repository numbers stay private, and #211 holds the aggregate table.

| | Main thread | Subagents |
|---|---|---|
| Assistant turns | 24,222 | 27,966 |
| Cost | $2,607 | $1,550 |
| Shell calls, failed (exit code) | 16,061, 424 | 22,791, 699 |
| Same failing command again, no file change between: runs, extra attempts | 2, 3 | 3, 4 |
| Their turns, cost | 7, $0.36 | 10, $1.32 |
| Same failing non-shell tool call again: runs, cost | 2, $0.32 | 2, $0.13 |
| Same error output 3 or more times from changing commands: runs, cost | 0, $0 | 1, $0.03 |
| `verify.mjs` calls, CI failures | 12, 3 | 136, 30 |
| Same CI failure signature again in one transcript: runs, extra attempts | 1, 1 | 3, 4 |
| Their turns, cost | 16, $0.92 | 25, $1.48 |
| Edits | 2,014 | 1,215 |
| Exact reverts (an edit undone by the reverse edit): count, cost | 5, $0.98 | 2, $1.15 |
| Churn: 3 or more overlapping edits with a line put back: chains, turns, cost (upper bound) | 6, 76, $9.79 | 4, 73, $4.41 |
| **All turns inside any of these runs, cost** | **107, $11.86** | **136, $8.24** |
| Share of turns, share of cost | 0.44%, 0.45% | 0.49%, 0.53% |
| Transcripts over 18 turns; transcripts with 8 or more tool errors | 148; 32 | 271; 14 |

Six more churn chains in the main thread had an owner's prompt inside them and were left out.

## Decision

- **Claudalisk builds no loop guard.** Over five weeks, loops of every kind measured cost about $20 out of about $4,157, or 0.5%. The churn row is an upper bound, because it counts every turn between the first and last edit of a chain, so the real share is lower.
- **The loops that do happen are short.** No repeated command or CI run went past three attempts, and the costliest of them was $1.35. A guard that caught every one of them at its first repeat would save less than the turns it adds when it fires on a session that is not looping.
- **The reference design's triggers would fire mostly on sessions that are not looping.** 46 transcripts had 8 or more tool errors, and 419 ran past 18 turns, but the spike found only 31 loop runs in all. An error count or a long session does not mark a loop.
- **CI loops are already bounded.** The verify script prints only the failures (CLA-0076), waiting for CI takes one call (CLA-0077), and an unexplained failure is rerun once and then investigated or filed (CLA-0022). The same CI failure came back in 4 runs, with 5 extra attempts in all, at $2.40. In 2 of those runs a repeat came with no edit between.
- **A later loop guard needs a new spike.** If a spike over at least four weeks of transcripts shows loops above 2% of spend, the guard is designed then. It would act through PostToolUse `additionalContext` and never stop the session, as #211 requires. The spike's method is in #211.

## Consequences

- No hook runs on every tool call to watch for loops, so sessions pay no extra Node process per call and keep no loop state.
- A rare long loop is not caught by a hook. The owner sees it in the session, and the implementer's turn limit (CLA-0074) bounds it.
- The loop guard leaves the list of code-intelligence candidates in #200 unless a new spike reopens it, through an ADR that amends this one.
