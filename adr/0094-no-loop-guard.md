# CLA-0094: No loop guard, because agent loops cost about half a percent of spend

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); a loop guard needs a new transcript spike first (CLA-0088)
- **Issue:** #211, #200

## Context

An agent can loop in three ways:

- it runs the same failing command again without changing anything;
- it reruns CI and gets the same failure;
- it edits the same lines back and forth.

Every turn resends the whole conversation (CLA-0073), so a loop can be expensive. A loop guard would watch tool calls and tell the agent when it is stuck.

#211 measured every transcript on the owner's machine from 2026-10-10 to 2026-11-15: 200 main-thread transcripts and 1,027 subagent transcripts.

- Each message and tool call was counted once, at list price.
- A run counted as a loop only when no prompt from the owner came inside it.
- The aggregate table is on the issue.

## Decision

- **No loop guard.** Loops of every kind cost about $20 of $4,157, or 0.5% of spend. The churn part of that is an upper bound.
- **The loops are short.** None went past three attempts, and the costliest cost $1.35. A guard that fired at the first repeat would add more turns on sessions that are not looping than it saved.
- **Error counts and session length do not mark a loop.** 46 transcripts had 8 or more tool errors, and 419 ran past 18 turns. There were only 31 loop runs in all.
- **CI loops are already bounded** by the verify script (CLA-0076) and the rule to rerun an unexplained failure once (CLA-0022).
- **What reopens it:** a spike over at least four weeks that finds loops above 2% of spend. The guard would then act through PostToolUse `additionalContext` and never stop a session.

## Consequences

- No hook runs on every tool call, and sessions keep no loop state.
- A rare long loop is caught by the owner, or bounded by the implementer's turn limit (CLA-0074).
