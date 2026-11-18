# CLA-0088: Token-saving features ship only on a measured saving, as claudalisk's own deterministic tools that work on every surface

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); the benchmark of #202; a tool's CI job on ubuntu, windows and macos
- **Issue:** #200, #201, #202, #232

## Context

Every model request sends the whole conversation again (CLA-0073). A feature that cuts what a session reads, or how many turns it takes, can cut its cost. It also adds schema, hooks and turns of its own, and a smaller tool output is not a cheaper session: cache reads, extra turns and rework decide what a task costs. In #146 a re-read guard was not built, because the transcripts showed no repeat reads. Measuring first saved building something with no effect. Epic #200 applied that rule to code intelligence, and no spike measured a saving.

Rejected options:

- Answers that a model writes from retrieved code. In a published benchmark, agents anchored on a local model's answers and scored lower than with the evidence alone.
- Embedding search. Several code assistants that built it moved back to text search and agent exploration.

## Decision

- **Measure before building.** A token-saving feature is built only after a transcript spike shows that the waste exists. Such features include a code-intelligence tool, a read guard (CLA-0078), a loop guard (CLA-0094) and tool-output compression (CLA-0095).
- **Keep it only on the benchmark's verdict.** It is kept when the benchmark of #202 shows that cost per accepted task drops, or that it holds while correctness rises. Token counts per call and output sizes are not evidence on their own.
  - Each arm and the baseline run 3 repeats of the task set on each model, and each model is judged on its own.
  - An arm lowers cost only when each of its repeats costs less per accepted task than each of the baseline's, and its mean is at least 10% lower.
  - Anything short of that is no effect.
- **Tool output is deterministic evidence.**
  - It holds parsed file content and exact `path:line` locations.
  - It never holds embeddings, local-model output or a summary that a model wrote.
  - The same code and the same call give the same output. A tool never returns a partial list as complete.
  - A tool that cannot answer says so, and says what it did not cover.
- **Claudalisk builds its own tools.** It depends on no external code-intelligence service and never copies copyleft code.
- **Every feature works everywhere.**
  - It runs on Windows, Linux and macOS, in the CLI, the Desktop app and `claude -p`.
  - It ships as plugin parts that every surface loads: hooks, agents and MCP servers. It never depends on a feature that only some surfaces have, such as Code Mode.
  - The plugin's hooks never refuse the calls that the terminal's code-execution mode makes.
- **Testing and CI.**
  - A token-saving tool's tests run on GitHub-hosted ubuntu, windows and macos runners, because this repository is public and the DinD runners refuse public repositories.
  - A binary that an app's CI needs goes into the DinD runner image (CLA-0086), not into each job.

## Consequences

- The benchmark can drop a feature that looks useful. Embedding search, a ranked repo map at session start and the tools of #200 stay out unless new evidence reopens them.
- The benchmark's budget, about $150, allows only a few runs per arm. A result without a verdict shows a direction only.
- A feature limited to one surface stays unused even where it would be cheaper there.
