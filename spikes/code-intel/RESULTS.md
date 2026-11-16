# Code-intelligence spike results

Phase 1 of lucem-labs/claudalisk#205: three interfaces over the language servers of CLA-0089, each exposed as an MCP server and as a CLI. The benchmark arms (phase 2) use these numbers as the schema overhead.

## Schema overhead

`node measure-schema.mjs --write` rewrites this table. A unit test fails when it is out of date.

<!-- schema:start -->
| Interface | Exposure | Tools | Schema bytes | Estimated tokens | Config bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| A | MCP | 8 | 3095 (tools/list) | 774 | 147 |
| A | CLI | 0 | 525 (skill text) | 132 | 0 |
| B | MCP | 9 | 3101 (tools/list) | 776 | 147 |
| B | CLI | 0 | 541 (skill text) | 136 | 0 |
| C | MCP | 1 | 559 (tools/list) | 140 | 147 |
| C | CLI | 0 | 644 (skill text) | 161 | 0 |

Tokens are an estimate: bytes divided by 4, rounded up. The benchmark gives the real figure.
<!-- schema:end -->

The MCP figure is the `tools/list` result, loaded into every session that enables the server. The CLI figure is the whole skill file; only its name and description are always in context, the rest loads when the skill is used. The CLI has no tool schema.

## Permission prompts in a default session

| Exposure | Prompt | Allow rule that silences it |
| --- | --- | --- |
| MCP | One prompt per tool, the first time each is called | `mcp__plugin_<plugin>_<server>__*` for the whole server, or one rule per tool |
| CLI | A Bash prompt for each distinct command | `Bash(node *spikes/code-intel/*)` |

The MCP server name is `code-intel-a`, `code-intel-b` or `code-intel-c`, so the rule for B is `mcp__plugin_<plugin>_code-intel-b__*`. A rename or a replaceBody writes files; the tool prompt is the only gate before the write, and the edit rules of CLA-0089 still apply to what is written.

## Latency

Observed on a developer machine (Windows, .NET 10, Roslyn 5.13, TypeScript 7.0.2) against the integration fixture, a small solution of two C# files and three TypeScript files. B `references` is the call under test; it re-queries until two consecutive counts match, so a warm call costs two requests.

| Language | Cold (server starts, project loads) | Warm |
| --- | --- | --- |
| C# | about 2.1 s for the first call after the project loaded; the server start and load before it took 12 to 15 s | about 1.3 s |
| TypeScript | about 0.3 s for the first call; the server start before it took 0.5 to 0.9 s | about 0.3 s |

## What the host and the servers needed

Nothing blocked an operation; every request of the brief is answered by one of the two servers. What each needed:

- TypeScript `workspace/symbol` returns an empty list until a file of the project is open, so the workspace opens one source file when it starts the server.
- Roslyn `workspace/symbol` names carry no namespace and give the container as `in Order (project Ordering (net10.0))`. Name paths are matched against the `documentSymbol` outline of the file instead, whose names carry a signature that is stripped.
- `tsc --lsp` renames a re-exported function with an alias (`export { totalOf as orderTotal }`) and leaves its users alone, unless the client answers `workspace/configuration` with `useAliasesForRenames: false`, as the host's barrel case does. The workspace answers that.
- Roslyn renames one overload per request. B `rename` asks for every overload's edit, merges them per file and applies them once through the host's edit rules.
- The host started Roslyn with its log folder beside the project root. `servers.mjs` now reads `LSP_HOST_LOG_DIR`, and the workspace points it at the temporary folder.
- Roslyn reports hints and informational diagnostics, such as "can be marked as static". The interfaces list only errors and warnings.
- `textDocument/implementation` on a method that implements nothing answers the method's own position.

## Benchmark

The arms are in `spikes/code-intel-bench/arms/`, run with the harness of lucem-labs/claudalisk#202 and `--setting-sources project,local`. Every arm is two repeats of each task, against a baseline of three. The noise rule needs three repeats on each side, so every comparison below reports "insufficient data"; the numbers give a direction, not a verdict. Wall time is left out: the machine ran other heavy work during the pass.

The owner stopped the pass on 2026-11-16 after the fixture and the first pack arm, because the results already pointed one way. Spend on the shared ledger was $69.59 of the $150 cap, including a $3 reserve still held by the run that was stopped.

### Fixture, T1 to T6

All 144 arm runs passed, as did the baseline.

| Arm | Sonnet cost per run | Opus cost per run | Sonnet cache read | Opus cache read | Code-intel calls per run, Sonnet / Opus |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | $0.11 | $0.26 | 194k | 244k | – |
| a-mcp | $0.13 | $0.30 | 300k | 366k | 0.8 / 0.3 |
| a-cli | $0.13 | $0.31 | 310k | 379k | 0.7 / 0.2 |
| b-mcp | $0.14 | $0.30 | 324k | 386k | 0.6 / 0.8 |
| b-cli | $0.13 | $0.30 | 319k | 386k | 1.8 / 0.4 |
| c-mcp | $0.13 | $0.27 | 293k | 328k | 0.1 / 0.2 |
| c-cli | $0.13 | $0.31 | 354k | 410k | 0.3 / 0.1 |

Turns stayed level with the baseline. Scout shell calls in the CLI arms, allowed / denied by the scout hook: Sonnet a-cli 8 / 2, b-cli 22 / 0, c-cli 4 / 1; Opus a-cli 2 / 3, b-cli 2 / 2, c-cli 1 / 4.

### Private pack, P1 to P8, arm b-mcp only

| Model | Side | Runs | Passed | Cost per run | Turns | Cache read | Code-intel calls per run |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sonnet | baseline | 24 | 23 | $0.20 | 7 | 449k | – |
| Sonnet | b-mcp | 16 | 16 | $0.20 | 8 | 491k | 0.9 |
| Opus | baseline | 24 | 24 | $0.43 | 11 | 588k | – |
| Opus | b-mcp | 14 | 14 | $0.47 | 11 | 651k | 0.5 |

The Opus arm is missing the second repeat of P7 and P8. No other arm reached the pack.

### Reading

- Every arm on every model costs more than the baseline on the fixture, 15 to 25 percent on Sonnet and 4 to 19 percent on Opus, with no gain in pass rate or turns.
- The agents call the tools less than twice a run. The extra cost is carrying the schemas and notes, which shows as 50 to 70 percent more cache read on the fixture.
- On the pack the carrying cost shrinks to about 10 percent of cache read, because the prompts are already large, but the tools still save nothing: Sonnet is level and Opus is 9 percent dearer.
- The smallest surface costs least: c-mcp, one tool of about 140 tokens, is the closest to the baseline, one cent above it on Opus.
- Opus scouts in the CLI arms reach for other shell commands and are denied more often than allowed.
