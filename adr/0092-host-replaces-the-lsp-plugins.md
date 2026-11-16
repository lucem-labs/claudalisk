# CLA-0092: The host replaces the LSP plugins in one change, and a PostToolUse hook delivers D1

- **Status:** accepted
- **Date:** 2026-11-16
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); `spikes/lsp-setups` tests and measurement on ubuntu, windows and macos; from #209 on, the app template's `.claude/settings.json` and its tests
- **Issue:** #207, #200

## Context

CLA-0080 has each developer install three LSP plugins from another marketplace, `csharp-ls-lsp`, `ts7-lsp` and `yaml-lsp`, for the scout's `findReferences` and for D1, the diagnostics Claude Code passes to the model after each edit. CLA-0089 picks Roslyn's server and TypeScript 7's server for claudalisk's own host (X1), which starts its servers itself. Three set-ups were possible:

1. **plugins + host:** the plugins stay and the host runs beside them.
2. **lspjson + host:** claudalisk ships the servers in its own `.lsp.json`, and the plugins go.
3. **host only:** Claude Code's `LSP` tool goes unused, and a PostToolUse hook on Edit and Write asks the host for the edited file's diagnostics and returns them as `additionalContext`.

Claude Code 2.1.316's LSP client, read from its bundled code, starts one set of servers per session, rooted at the project folder. It advertises `publishDiagnostics` and no `textDocument.diagnostic`, so it never pulls diagnostics and gets only what a server pushes. It sends only standard messages, so it cannot send Roslyn's `solution/open`. `spikes/lsp-setups` emulates that client exactly, with the capabilities in `fixtures/claude-code-client.json`. It runs the three set-ups on the app that `spikes/lsp-host` and #202 use, and adds a minimal per-worktree host daemon and the PostToolUse hook. CI run https://github.com/lucem-labs/claudalisk/actions/runs/43778870263 at `3982983`, with csharp-ls 0.28.0, `roslyn-language-server` 5.13.0-1.26514.10, TypeScript 7.0.2 and `yaml-language-server` 2.0.0. The tables are in `spikes/lsp-setups/RESULTS.md`.

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

## Decision

- **Host only.** Claudalisk ships no `.lsp.json`. The app template stops enabling `csharp-ls-lsp`, `ts7-lsp` and `yaml-lsp`, stops registering the `claude-toolkit` marketplace, and keeps `csharp-lsp` and `typescript-lsp` set to `false`, so that a user-level install never starts a server beside the host. Claude Code's `LSP` tool is not used. The scout gets references and the other N rows from the host's tools (#205, #208).
- **Not side by side.** Running the plugins beside the host doubles the servers and costs 1.7 to 1.9 GB per worktree, against 1.0 to 1.2 GB for the host alone. It also gives two sources of C# and YAML diagnostics, and still none for TypeScript.
- **Not `.lsp.json`.** Claude Code's client only receives pushed diagnostics, and neither Roslyn nor TypeScript 7 pushes. A `.lsp.json` with the host's servers would give D1 for YAML only. A `.lsp.json` with csharp-ls would keep a second C# server beside the host.
- **D1 is a PostToolUse hook on `Edit`, `Write` and `MultiEdit`.**
  - It finds the worktree that holds the edited file and asks that worktree's host for the file's diagnostics.
  - It returns them as `additionalContext`, one line each: `path:line:col severity code message`. It prints nothing when there are none.
  - It has a deadline. When the host is not ready in time, it prints nothing and exits 0, so it never blocks an edit.
  - Hooks load in the CLI, the Desktop app and `claude -p` (CLA-0088).
- **The host starts at session start.** A SessionStart hook starts the worktree's host in the background, so that the C# server has loaded before the first edit. A cold C# server needs 6 to 14 s, which is longer than the hook's deadline.
- **One host per worktree.** It listens on a named pipe on windows and a unix socket elsewhere, both named from a hash of the worktree root. It roots every server in that worktree and opens the C# solution by path, as the measured isolation needs. Sessions in the same worktree share it.
- **`yaml-language-server` joins the host as its third server, pinned exactly.** The server answers no pull, so the host waits for its push after a sync. D1 for workflows, Compose files and Dependabot config stays as CLA-0080 describes it.
- **The host installs its own servers.** On first start it restores the pinned tool manifest and npm packages into the plugin's data folder. A developer installs no plugin and no global server.
- **The switch is one change, and it is measured first.** Until #208 ships the host, its D1 hook and the scout's references through it, CLA-0080's plugins stay as they are. The template change (#209) adds the host and removes the plugins in the same pull request, so no app ever runs both. That change lands only when the #202 benchmark shows the host arm holding or lowering cost per accepted task (CLA-0088). The owner runs those sessions.
- **The catalogue rows are amended by id:**
  - **D1:** built by the host and delivered by the PostToolUse hook, for C#, TypeScript and YAML.
  - **X1:** one host per worktree, started at session start and shared by its sessions. It replaces Claude Code's `LSP` tool and the LSP plugins.

## Consequences

- TypeScript edits get diagnostics before the build for the first time. Until #209 they get none, and the build catches type errors.
- The host alone uses about 0.3 to 0.5 GB more per worktree than the plugins alone did, mostly for Roslyn and the host's TypeScript server.
- Claudalisk carries the hook, the daemon and its socket naming, and their tests on three OSes. A Claude Code release that starts pulling diagnostics would reopen the `.lsp.json` option; `fixtures/claude-code-client.json` records the client this was measured against.
- An edit made in the first seconds of a cold session can get no C# diagnostics. The build still checks it (CLA-0076).
- `spikes/lsp-setups` stays as the harness to re-measure after a server or Claude Code upgrade.
- CLA-0080's plugin section names this ADR, and it is rewritten when #209 lands.
