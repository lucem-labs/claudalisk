---
name: session-economy
description: Claudalisk session decisions (ADRs) that keep token use down, such as one session per issue, the handoff note on the issue, and an implementer subagent for the build, test and fix loop. Use when starting or picking up work on an issue, implementing a scoped issue, opening a pull request, stopping for the day, or when the context is getting large in a claudalisk app.
user-invocable: false
---

# Session economy

Every model request sends the whole conversation again, so a long session costs more with every step. These are claudalisk's decisions for keeping sessions small. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before acting on one of these steps, read the ADR.

- [CLA-0073](${CLAUDE_PLUGIN_ROOT}/adr/0073-one-session-per-issue.md) (accepted): one session works on one issue. To hand over, post a handoff note as a comment on the issue and stop; the next session starts from the issue and its latest handoff note.
- [CLA-0074](${CLAUDE_PLUGIN_ROOT}/adr/0074-main-thread-plans-subagent-iterates.md) (accepted): the main thread plans and reviews; once an issue is scoped, the `claudalisk:implementer` subagent runs the build, test and fix loop, leaves changes uncommitted, stops on design questions and returns a report of at most 300 words.
