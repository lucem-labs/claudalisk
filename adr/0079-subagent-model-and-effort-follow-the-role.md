# CLA-0079: A subagent's model and effort follow its role

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** the `model` and `effort` frontmatter of the plugin's agents (`claude plugin validate` checks it); session-economy skill; reviewer
- **Issue:** #98

## Context

Output tokens are the most expensive kind, and a higher effort level makes a model write more of them on every request. In one week of usage logs, nine subagents that ran at max effort produced 17% of the week's output tokens. Output per request was 6.9k tokens for Fable at max, 2.4k for Sonnet at max and 2.1k for Opus at max, against 1.25k for Sonnet at medium. A subagent that inherits the main thread's model and effort, or gets max effort by habit, pays that price on every step of a long loop.

Roles differ in what they need. A build, test and fix loop or a search takes many small steps, and each step is simple. A review or a design question takes few steps, and the quality of each judgement decides the outcome. A watcher only waits and reports what it sees.

## Decision

- **Implementers and research agents run on Sonnet at medium effort.** This covers the build, test and fix loop (CLA-0074) and agents that read and summarise docs or logs.
- **Code discovery runs on Haiku at low effort.** The `claudalisk:scout` agent searches and reads code for the main thread (CLA-0080). On that task Haiku found the same code as Sonnet for less.
- **Review and design agents run on Opus, or at max effort.** They take few steps, and judgement matters more than the cost per step. Max effort is for these roles only, never for a role that loops.
- **Watchers that only wait and report run on Haiku.** A watcher runs a command, waits and returns what it saw. It needs no judgement.
- **The plugin's agents declare their model and effort in frontmatter,** so the default is right without a choice each time. `claudalisk:implementer` declares `model: sonnet` and `effort: medium`, and `claudalisk:scout` declares `model: haiku` and `effort: low`. A new agent in the plugin states both.
- **An agent without that frontmatter gets them from the call.** When the main thread starts a built-in or general agent, it passes the model and effort of the agent's role, instead of letting it inherit the main thread's.
- **A multi-model review is an exception for the model only.** A review that asks several models on purpose, such as a quorum review, keeps the models it names, since the spread of models is what it is for. Each reviewer runs at the effort the review names, and at medium effort when it names none. The second opinions come from the different models, not from max effort on each of them.
- **The owner may override a role's default** for one task, by saying so in the request.

## Consequences

- The many requests of a loop run on the cheaper model at the effort that fits, so a long loop costs a fraction of what it cost at max effort.
- Review and design keep the stronger model where it changes the outcome.
- A new agent in the plugin is checked against this ADR in review, and `claude plugin validate` rejects frontmatter it cannot read.
- A role this ADR does not name takes the nearest one: an agent that loops is an implementer, and an agent that judges is a reviewer.
