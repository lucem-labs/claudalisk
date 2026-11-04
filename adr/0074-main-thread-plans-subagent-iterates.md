# CLA-0074: The main thread plans and reviews, and an implementer subagent runs the build, test and fix loop

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** workflow
- **Enforced by:** `implementer` agent; workflow skill; reviewer
- **Issue:** #93

## Context

Every model request sends the whole conversation again (CLA-0073). A build, test and fix loop makes many requests, mostly shell commands and their output. When it runs on the main thread, each of those requests carries everything the session has read so far, often hundreds of thousands of tokens. A subagent starts with a small context of its own and sends only its final report back to the main thread.

## Decision

- **The main thread plans and reviews.** It keeps scoping the issue, design questions, reviewing the change and committing what the review changes, opening the pull request (CLA-0023) and the uat deploy (CLA-0030).
- **Once an issue is scoped, the implementer subagent runs the implement, build, test and fix loop.** The plugin ships it as the `claudalisk:implementer` agent: Sonnet at medium effort, the implementer role's default (CLA-0079), with file and shell tools only.
- **The main thread's brief names** the issue, the worktree, the files or area to change, what done looks like and any decisions already made.
- **The implementer iterates until CI is green.** It checks each change with one call to the app's verify script (CLA-0076), which commits, pushes the issue branch and reads CI's result. In an app without the verify script, it runs the build and test commands the app's `AGENTS.md` lists, and leaves its changes uncommitted.
- **The implementer commits and pushes only through the verify script, to the issue branch.** It never opens a pull request, deploys, files issues, rewrites history or pushes `main`. The main thread reviews the branch diff since the brief, and commits what the review changes, before it opens the pull request.
- **A design question the implementer cannot answer stops it.** It does not guess and it does not file an issue. It returns the question in its report, with the options it sees and what it has done so far. The main thread decides, asks the owner, or files a CLA-0022 issue for a bug outside the issue's scope.
- **The implementer returns a report of at most 300 words:** what changed, the commits it pushed with the last CI result, and open questions.
- Small changes that need no build and test loop, such as a one-line fix or a docs edit, stay on the main thread.

## Consequences

- The many requests of a build, test and fix loop run at a small context, so they cost far less.
- The main thread's context grows by a brief and a short report per loop, not by every command's output.
- Review stays on the main thread, which holds the issue's design and decisions.
- The implementer does not see the main thread's conversation, so a vague brief costs a second round. The brief carries what it needs.
