# CLA-0092: The LSP plugins stay and no host is built, because the diagnostics a host would add are worth too little

- **Status:** accepted
- **Date:** 2026-11-16
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); the app template's `.claude/settings.json` (CLA-0080)
- **Issue:** #207, #200, #208

## Context

CLA-0080 has each developer install three LSP plugins from another marketplace, `csharp-ls-lsp`, `ts7-lsp` and `yaml-lsp`, for the scout's `findReferences` and for D1, the diagnostics Claude Code passes to the model after each edit. CLA-0089 picks Roslyn's server and TypeScript 7's server for claudalisk's own host (X1), which starts its servers itself. Three set-ups were possible:

1. **plugins + host:** the plugins stay and the host runs beside them.
2. **lspjson + host:** claudalisk ships the servers in its own `.lsp.json`, and the plugins go.
3. **host only:** Claude Code's `LSP` tool goes unused, and a PostToolUse hook on Edit and Write asks the host for the edited file's diagnostics and returns them as `additionalContext`.

Claude Code 2.1.316's LSP client, read from its bundled code, starts one set of servers per session, rooted at the project folder. It advertises `publishDiagnostics` and no `textDocument.diagnostic`, so it never pulls diagnostics and gets only what a server pushes. It sends only standard messages, so it cannot send Roslyn's `solution/open`. The spike emulates that client exactly, with its recorded capabilities. It runs the three set-ups on the app that CLA-0089 and #202 use, and adds a minimal per-worktree host daemon and the PostToolUse hook. CI run https://github.com/lucem-labs/claudalisk/actions/runs/43778870263 at `3982983`, with csharp-ls 0.28.0, `roslyn-language-server` 5.13.0-1.26514.10, TypeScript 7.0.2 and `yaml-language-server` 2.0.0.

- **Diagnostics after an edit.** Each case ran 5 times: a broken edit must produce the expected error, and the fixing edit must clear it. The push set-ups waited 20 s after `didChange`, then sent `didSave` and waited 20 s more. The results were the same on all three OSes.

  | Set-up | C# | TypeScript | YAML |
  |---|---|---|---|
  | plugins | 5/5, csharp-ls push, 189 to 315 ms median | 0/5, nothing pushed | 5/5, push, about 205 ms |
  | lspjson (Roslyn) | 0/5, nothing pushed | 0/5, nothing pushed | 5/5, push |
  | host | 5/5, pull, 64 to 176 ms median, p95 up to 1.3 s | 5/5, pull, 3 to 53 ms median | 5/5, the host takes the server's push, about 225 ms |

  So `ts7-lsp` has never given the model a TypeScript diagnostic, and CLA-0080's statement that the plugins push diagnostics after each edit holds only for C# and YAML.
- **Roslyn without `solution/open`:** started with `--stdio` alone, it loads no solution and its references are incomplete. With `--autoLoadProjects`, a flag its help does not list, it loads the solution in 5.4 to 10.0 s, and it still pushes nothing. In a `.lsp.json`, Roslyn gives the `LSP` tool references but gives no D1. csharp-ls in a `.lsp.json` behaves exactly like the plugin, so it would be the same plugin moved into claudalisk, running beside the host's Roslyn.
- **Servers and memory**, the resident memory of each process tree, measured with everything running together, in MB:

  | OS | plugins, 1 worktree | host, 1 | plugins + host, 1 | plugins + host, 2 worktrees | host, 2 |
  |---|---|---|---|---|---|
  | linux | 720 | 1075 | 1797 | 3612 | 2153 |
  | macos | 702 | 1164 | 1883 | 3042 | 2346 |
  | windows | 692 | 1028 | 1684 | 2406 | 2040 |

  The host runs three servers and its daemon per worktree. Side by side with the plugins, that is six servers per worktree, with two C# servers and two TypeScript servers. Windows figures are the working set, which reads low when two worktrees run.
- **Two worktrees:** with A the app, B at `A/.claude/worktrees/B` and C a sibling, every server in every set-up returned exactly the expected references, all inside its own root, and C# loaded its own root's solution. The control, `csharp-ls` started with no `--solution` as the official plugin does, found both A's and B's solutions from A and still answered correctly on this fixture. The wrong load that CLA-0080 records is therefore not reproduced here, but nothing prevents it.
- **The hook**, measured as the wall time of the whole hook process (node start, connect, sync, pull and print). Warm, it was correct 14 of 14 times per language and OS, with a median of 63 to 301 ms and a p95 of at most 360 ms. Cold, with no daemon running, TypeScript and YAML answered in under 1 s. C# needed 6.1 s on linux, 6.4 s on windows and 13.8 s on macos before its first answer. At a 1000 ms deadline, the hook printed nothing for the first 6 to 15 edits.
- **Install steps:** the plugins set-up needs six developer steps, three plugin installs and three global installs of the server binaries. The lspjson set-up still needs three global installs of the binaries. The host restores its own pinned servers with `dotnet tool restore` and `npm ci`, which took 0.6 to 8.3 s in CI, and needs no developer step beyond the .NET SDK and Node.
- **Ceiling check (#208).** Before building, every local transcript was measured: 1,954 files, each message and tool call counted once, cost at list price. A round is a build, test, typecheck, lint, verify or CI-watch command whose output holds a compile error after a check that held none. The floor is the turn that ran the failing check, which edit-time diagnostics would have spared. The ceiling is every turn from that failure to the next clean check, including the fix, which still happens with D1.

  | Rounds, share of that side's spend | Main thread, floor / ceiling | Subagents, floor / ceiling |
  |---|---|---|
  | TypeScript | 0.14% / 0.44% | 0.01% / 0.02% |
  | C# | 0.29% / 0.70% | 0.35% / 0.69% |

  Across all spend, TypeScript rounds cost at most 0.28%, and every compile-error round together at most 0.98%. TypeScript is the only language the host would newly cover, since csharp-ls already pushes C# diagnostics and the plugins cover YAML. These are the orders of magnitude at which CLA-0094 and CLA-0095 decided not to build. A benchmark arm with 2 runs per side could not resolve a saving below 0.5%, so it was not run.

## Decision

- **No host is built.** The template keeps today's set-up as CLA-0080 describes it: it enables `csharp-ls-lsp`, `ts7-lsp` and `yaml-lsp` from the `claude-toolkit` marketplace, keeps `csharp-lsp` and `typescript-lsp` set to `false`, and the scout uses Claude Code's `LSP` tool for references. TypeScript diagnostics at edit time, the only thing the host would add, are worth at most 0.28% of spend, and every compile-error round together at most 0.98%. Building, testing on three OSes and maintaining the host, its daemon and its hook costs more than that can return.
- **What reopens it.** A later ADR revisits this if:
  - a Claude Code release pulls diagnostics (`textDocument.diagnostic`), so that a `.lsp.json` with TypeScript 7's server would give TypeScript D1 without a host;
  - a transcript spike by the same method finds compile-error rounds that the plugins do not already cover above 2% of spend;
  - or the #202 benchmark shows a host arm lowering cost per accepted task.
- **If a host is built later, it starts from what this spike settled.** The measurements above stay valid until a server or Claude Code upgrade, and they gave:
  - **Host only, not side by side.** Running the plugins beside the host doubles the servers and costs 1.7 to 1.9 GB per worktree, against 1.0 to 1.2 GB for the host alone, and gives two sources of C# and YAML diagnostics and still none for TypeScript.
  - **Not `.lsp.json`** while Claude Code's client only receives pushed diagnostics, because neither Roslyn nor TypeScript 7 pushes.
  - **D1 as a PostToolUse hook on `Edit`, `Write` and `MultiEdit`** that asks the worktree's host for the file's diagnostics, returns at most 20 as `additionalContext` lines `path:line:col severity code message`, has a deadline, always exits 0, and says when an edit went unchecked and why (CLA-0088).
  - **The host started by a SessionStart hook**, one per worktree on a named pipe or unix socket named from a hash of the worktree root, rooting every server in that worktree, opening the C# solution by path, with `yaml-language-server` as a third server, and restoring its own pinned servers.
  - **The switch made in one change**, adding the host and removing the plugins together, so that no app runs both.
- **The catalogue rows are amended by id:**
  - **D1:** stays with the LSP plugins, for C# and YAML. TypeScript gets none before the build.
  - **X1:** not built. The rows that need it, N1 to N6, U1, U3, E1 to E7 and D2, are not built either, since CLA-0090 and CLA-0091 found no role that would call them.

## Consequences

- TypeScript edits get no diagnostics before the build, and the verify script's build catches type errors (CLA-0076).
- Developers keep the plugins' six install steps: three plugin installs and three global installs of the server binaries.
- Claudalisk carries no hook, daemon or socket naming for code intelligence, and no three-OS test job for them.
- The wrong-solution load that CLA-0080 records stays handled by `csharp-ls-lsp`, which pins the nearest solution.
- The spike stays available to re-measure after a server or Claude Code upgrade, and it recorded the client this was measured against.
- CLA-0080's plugin section stands and names this ADR.
