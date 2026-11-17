# CLA-0091: No role calls the code-intelligence tool, and the main thread keeps discovery through the scout

- **Status:** accepted
- **Date:** 2026-11-17
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023)
- **Issue:** #206

## Context

CLA-0090 left one question open: which role, if any, gets the snippet interface C over MCP. It measured C on the scout and the implementer and found no saving. That left the main thread. The main thread runs on the session's model, Sonnet or Opus. The scout runs on Haiku, so a lookup the main thread makes itself spends the expensive model's tokens to save the cheap model's.

One arm tested this. The main thread got C over MCP with the edit operations, and a session-start note told it to call the tool itself for questions about named symbols and to send the scout only open-ended exploration. `scout-gate` matches only the built-in search and shell tools, so it lets MCP calls through. The scout and implementer stayed as CLA-0080 has them.

The #202 harness ran three new tasks where text search can miss uses:

- **T8, overloads:** list every call of two of four overloads of one method, with a same-named method on another type and uses through method groups and a lambda.
- **T9, implementations:** rename an interface method across a base class, an override and an explicit implementation, and leave an unrelated method with the same name alone.
- **T10, aliases:** rename an exported TypeScript function that is re-exported under an alias, imported under another alias and through a namespace import, and leave a same-named function in another slice alone.

Hidden tests check each task. Each task ran 3 times per side on Sonnet 5.5 and Opus 5.5 with the claudalisk plugin and `--setting-sources project,local`. With so few runs the noise rule cannot give a verdict, so the numbers show a direction only. Wall time is left out because the machine was shared.

| Model | Side | Passed | Cost per run | Turns | Cache read tokens | Subagents | Tool calls |
|---|---|---|---|---|---|---|---|
| Sonnet | baseline | 9 of 9 | $0.14 | 9 | 328k | 1.0 | – |
| Sonnet | main thread with C | 9 of 9 | $0.13 | 8 | 360k | 0.9 | 1.4 |
| Opus | baseline | 9 of 9 | $0.26 | 8 | 295k | 1.1 | – |
| Opus | main thread with C | 9 of 9 | $0.32 | 10 | 423k | 1.0 | 1.8 |

- **The main thread used the tool.** Every run called it, and on T10 Sonnet renamed through it without sending the scout.
- **Opus still sent the scout.** Every Opus run called the tool and also sent the scout, so it added turns and context. It cost more on each task, and 23 percent more overall.
- **The scout was never the cost.** The Haiku scout cost $0.002 to $0.003 per run on both sides. Nearly all of the cost was the main thread, so moving lookups from the scout to the main thread saves less than a cent and costs whatever the tool's output adds to the main thread's context.
- **Nothing failed on either side.** Text search through the scout found every use in all three tasks, so the tool had no missed uses to make up for.
- These runs used the CLI's print mode. Code Mode was not measured, and nothing here depends on it.

## Decision

- **No role calls the code-intelligence tool.** The main thread, the scout and the implementer carry none of the interfaces. CLA-0090 measured the scout and the implementer, and this spike measured the main thread. None saved cost, turns or failures.
- **The main thread keeps discovery through the scout.** CLA-0080 stands as written. `scout-gate` gets no MCP rule, because no tool reaches the main thread to need one.
- **#208 builds the host and CLA-0092's hooks only.** The host serves D1 through the PostToolUse hook and serves scripts. No agent tool list and no plugin MCP server changes, and #209 has no tool list to change.

## Consequences

- Sessions keep today's cost and today's discovery path.
- The snippet sandbox stays out of the plugin, so its limits are not a shipped guarantee and its tests need not run in CI.
- The arm and the three tasks stay in the benchmark. A cheaper main-thread model, a server whose output is smaller, or a task where text search misses uses can reopen this. More repeats per side would give the noise rule a verdict.
- This settles the question that CLA-0090 and CLA-0092 left to #206. The scout keeps finding references as CLA-0080 has it.
