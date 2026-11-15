# CLA-0095: No tool-output compression, because the output it could filter is a small share of context

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023): a change that adds a tool-output filter, or a `PostToolUse` hook that rewrites tool output, must cite a later ADR that amends this one
- **Issue:** #212, #200

## Context

CLA-0088 says tool-output compression is built only if a transcript spike first shows that the waste exists. #146 set the method: measure real transcripts, then decide. In #146 the re-read guard was not built.

Claudalisk already compacts one kind of output. `scripts/verify.mjs` waits for CI and prints only the failures. It dedupes the failure annotations, caps its output at `OUTPUT_LIMIT = 4000` characters, and writes the full job logs outside the checkout (CLA-0076, CLA-0077). Compression would go further. A `PostToolUse` hook would return `updatedToolOutput` with deterministic per-command filters, for example for build, test and lint output, and keep the original somewhere the agent can read it.

The spike in #212 measured every transcript still on the owner's machine:

- **Sample:** 200 main-thread sessions and 1,027 subagent runs, 50 of them workflow agents, from 2026-10-10 to 2026-11-15. They sent 52,745 model requests with 12.5 billion input tokens, compacted 72 times and returned 70,419 tool results. 61 transcripts come from this repository and 1,166 from apps.
- **Desktop app:** its redirected local folder holds only MCP logs and another plugin's data, no transcripts. Desktop sessions write their transcripts to the same `~/.claude/projects` folder as the CLI.
- **Share of context:** the sum, over every request, of the tokens of each tool result still in that request's context, divided by all requests' input tokens (uncached, cache reads and cache writes). A result counts from the request after it until the next compaction or the end of its session. Tokens are estimated from characters at 2.42 characters per token, the median of 6,150 single-result request pairs, with an interquartile range of 2.22 to 2.65. The shares move with that ratio by about 9% either way.
- **Share of cost:** the same, with cache writes weighted 1.25 or 2 times the input price (5-minute or 1-hour cache), cache reads 0.1 times and output 5 times.
- **Truncated** means another plugin had already trimmed the output and kept the full text in a file, or Claude Code had saved or cut it. A follow-up is a re-run of the same command, or a read of the saved output or a `.log` file, within the next five tool calls.

| Group | Results | Median chars | p95 chars | Share of context | Share of cost | Truncated | Truncated, then followed up |
|---|---:|---:|---:|---:|---:|---:|---:|
| File reads (`Read`, and `sed`, `cat`, `head`, `tail`, `awk`, `cut`, `less`, `more`, `nl`, `type`, `Get-Content`) | 18,911 | 2,023 | 19,290 | 23.43% | 19.12% | 601 | 135 |
| Scripts and other shell (`python`, `node -e`, loops) | 15,158 | 577 | 7,182 | 8.98% | 7.05% | 224 | 70 |
| Search and listing (`Grep`, `Glob`, `grep`, `ls`) | 11,080 | 1,132 | 8,009 | 7.75% | 6.14% | 226 | 34 |
| Git and GitHub (`git`, `gh issue`, `gh pr`, `gh api`) | 5,201 | 545 | 10,272 | 3.21% | 2.60% | 252 | 82 |
| Other tools (MCP, skills, tasks) | 6,499 | 61 | 1,091 | 1.15% | 0.89% | 0 | 0 |
| Web and browser | 1,452 | 598 | 4,687 | 0.88% | 0.77% | 22 | 10 |
| Local build, test and lint (`dotnet`, `npm`, `npx`) | 1,671 | 540 | 4,259 | 0.73% | 0.58% | 10 | 1 |
| Edits and writes | 7,729 | 188 | 278 | 0.57% | 0.45% | 0 | 0 |
| Subagent reports | 1,095 | 1,069 | 1,113 | 0.48% | 0.38% | 0 | 0 |
| CI by hand (`gh run`, `gh pr checks`) | 559 | 429 | 3,915 | 0.18% | 0.14% | 2 | 2 |
| Docker | 350 | 397 | 2,992 | 0.16% | 0.12% | 0 | 0 |
| CI through `verify.mjs` | 714 | 602 | 3,151 | 0.08% | 0.08% | 6 | 1 |
| **All tool results** | 70,419 | | | 47.59% | 38.33% | 1,343 | 335 |

What else the numbers show:

- **The output that deterministic filters suit is small.** Local build, test and lint output, CI by hand, `verify.mjs`, Docker, and git and GitHub together are 4.36% of context and 3.52% of cost. Since 2026-11-04 they are 2.70%.
- **Reading is the cost.** File reads and search are 31% of context. Since 2026-11-04, after the main thread's shell reads were gated (CLA-0080), the main thread's shell reads fell to about 1% of its context, from 17% before. Subagents still read through the shell: since that date `sed`, `grep` and `cat` are 25% of subagent context, and 32% of the implementer's tool output is shell reads.
- **What `verify.mjs` covers is already small.** Its 714 results are 0.08% of context, with a median of 602 characters. CI read by hand instead, through `gh run` and `gh pr checks`, is 0.18%.
- **Another plugin already trims long output.** It trimmed 1,038 results and cut about 2.3 million tokens. That is 1.35% of context that is no longer there, and it is not counted in the table.
- **Truncation costs a follow-up one time in four.** Of 1,343 truncated results, 335 (25%) were followed by a re-run or a read of the full output.
- **Avoidable results are rare.** A result identical to one already in the context, for the same call, happened 54 times, 0.01% of context. Commands that read CI by hand anywhere in their text, which `verify.mjs` would have replaced, are at most 0.45% of context.

## Decision

- **Claudalisk builds no tool-output compression.** No `PostToolUse` hook rewrites tool output, and the plugin ships no per-command output filters.
  - Filters would act on 4.36% of context. Halving all of it would save about 2% of context and less of cost, under what the benchmark from #202 can tell apart from noise, and before the cost of a Node process on every tool call.
  - Compressing file reads and search would change the evidence the agent asked for (CLA-0088). Read cost is left to the read rules (CLA-0078), the scout (CLA-0080) and the code-intelligence tools U1, E4 and N1 to N6 (CLA-0088), which the benchmark measures.
- **`verify.mjs` stays the one compaction for CI output** (CLA-0076).
- **A later ADR may revisit this,** if a spike with the same method finds build, test, lint, CI, Docker and git output above 10% of context, or the benchmark finds rework caused by such output. That design must:
  - use `PostToolUse` with `updatedToolOutput`;
  - use deterministic filters only;
  - never return output longer than the original;
  - keep the original retrievable outside the checkout, as `verify.mjs` keeps its logs.
- **The analysis scripts stay out of the repository.** The transcripts come mostly from private repositories, so only the aggregate table by tool and command family is published, on #212.

## Consequences

- No hook runs on each tool call, and there is no filter list to keep up with new versions of `dotnet`, `npm`, `vitest` or `gh`.
- Agents keep seeing full build, test and git output. In this sample it costs less than the outputs a filter could not touch.
- Truncation is already happening on the owner's machine, through another plugin and through Claude Code. One truncated result in four led to another call, so a filter that hides lines has a cost that the size of its output does not show.
- The evidence points at reads, mostly in subagents. In subagents CLA-0078 is a prompt rule only, and the implementer reads through the shell. The code-intelligence work in #200 targets that cost, and the benchmark decides.
- A later spike that repeats this measurement can compare its table with the one on #212 directly.
