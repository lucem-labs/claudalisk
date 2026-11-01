---
name: session-economy
description: Claudalisk session decisions (ADRs) that keep token use down, such as one session per issue and the handoff note on the issue. Use when starting or picking up work on an issue, opening a pull request, stopping for the day, or when the context is getting large in a claudalisk app.
user-invocable: false
---

# Session economy

Every model request sends the whole conversation again, so a long session costs more with every step. These are claudalisk's decisions for keeping sessions small. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before acting on one of these steps, read the ADR.

- [CLA-0073](${CLAUDE_PLUGIN_ROOT}/adr/0073-one-session-per-issue.md) (accepted): one session works on one issue. To hand over, post a handoff note as a comment on the issue and stop; the next session starts from the issue and its latest handoff note.
