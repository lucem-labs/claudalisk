# CLA-0074: The main thread plans and reviews, and an implementer subagent runs the build, test and fix loop

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** workflow
- **Enforced by:** `implementer` and `reviewer` agents; workflow, work-issue and review skills; `tools/work-issue.test.mjs`, `tools/implement-and-review.test.mjs` and `tools/agent-limits.test.mjs` in CI's `adrs` job; reviewer
- **Issue:** #93, #194, #16, #241

## Context

Every model request sends the whole conversation again (CLA-0073). A build, test and fix loop makes many requests, mostly shell commands and their output. On the main thread, each of those requests carries everything the session has read so far. A subagent starts with a small context of its own and sends only its final report back.

A Claude Code workflow runs agents unattended, but it cannot ask the user a question while it runs.

## Decision

- **The main thread plans and reviews.** It keeps scoping the issue, design questions, reviewing the change and committing what the review changes, opening the pull request (CLA-0023) and the uat deploy (CLA-0030).
- **Once an issue is scoped, the `claudalisk:implementer` subagent runs the implement, build, test and fix loop.** It runs on Sonnet at medium effort (CLA-0079), with file and shell tools only.
- **The brief names** the issue, the worktree, the files or lines to change (CLA-0078), what done looks like and any decisions already made.
- **The implementer iterates until CI is green.** It checks each change with one call to the app's verify script (CLA-0076), which commits and pushes the issue branch and reads CI's result. In an app without the verify script, it runs the build and test commands the app's `AGENTS.md` lists, and leaves its changes uncommitted.
- **The implementer commits and pushes only through the verify script, to the issue branch.** It never opens a pull request, deploys, files issues, rewrites history or pushes `main`.
- **A design question the implementer cannot answer stops it.** It returns the question with the options it sees and what it has done. The main thread decides, asks the owner, or files a CLA-0022 issue for a bug outside the issue's scope.
- **It returns a report of at most 300 words:** what changed, the commits it pushed with the last CI result, and open questions.
- **Every long subagent stays small.** Each agent a skill or workflow starts from a brief sets `maxTurns` and `autoCompactWindow`, so no long run goes to a general-purpose agent. The implementer has 150 turns and the reviewer 80, both with a 150,000-token window. Both take effect for plugin agents on the CLI and desktop app. The window is an integer of at least 100,000, and compaction starts about 33,000 tokens below it. Usage logs showed implementer runs up to 566k tokens before these limits (#194), and none above 168k with a 200,000 window (#241).
- **One deep cut beats many small ones.** Cache reads cost 0.1× and five-minute writes 1.25× the input price, so dropping Δ tokens pays back after N > 11.5 · R / Δ further requests, where R is the context written again. Cutting 300k to 100k pays back after about six requests. Never trim a little on every request.
- **A run that reaches `maxTurns` returns its output marked partial.** A message to the agent grants it a fresh turn cap, so the main thread resumes it at most once. After that it asks for a short handoff and starts a fresh agent from the handoff and what is left of the brief, at most twice per issue.
- **The `claudalisk:implement-and-review` workflow runs the unattended stretch.** That stretch is the implementer, the review plan and the reviewer agents in parallel, with the models of CLA-0079 and the quorum of CLA-0023. The main thread keeps what needs a person or the host: the brief, the design questions, `/code-review`, counting findings, the pull request, the uat deploy and the handover. Without the Workflow tool, the same steps run on the Agent tool.
- **`/claudalisk:work-issue` lists the lifecycle steps and the ADR of each,** without restating them. `tools/work-issue.mjs status <issue>` reads where an issue stands, read-only, through `gh` and `git`.
- Small changes that need no build and test loop, such as a one-line fix or a docs edit, stay on the main thread.

## Consequences

- The many requests of a build, test and fix loop run at a small context, and the main thread's context grows only by a brief and a short report per loop.
- Review stays on the main thread, which holds the issue's design and decisions.
- The implementer does not see the main thread's conversation, so a vague brief costs a second round.
- A resumed session runs one command to learn its step. The status script reads only what GitHub and git record, so a uat deploy that was not recorded as a deployment reads as not done.
