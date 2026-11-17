# CLA-0092: Apps use three LSP plugins, and claudalisk builds no code-intelligence tools or host

- **Status:** accepted
- **Date:** 2026-11-16
- **Area:** workflow
- **Enforced by:** the app template's `.claude/settings.json`; the template's agent tool lists, which carry no code-intelligence tools; reviewer (CLA-0023)
- **Issue:** #200, #203, #205, #206, #207, #208

## Context

The scout finds every use of a symbol through Claude Code's `LSP` tool (CLA-0080), and Claude Code passes a language server's pushed diagnostics to the model after each edit. Epic #200 asked whether claudalisk's own tools, over a language-server host, would cut session cost further (CLA-0088). Its spikes found no saving:

- No interface to the tools saved cost, turns or failures on the scout or the implementer, on Sonnet or Opus. Interfaces addressed by position, by symbol name or by a snippet, over MCP or a CLI, all cost more, because each session carried their schema (#205).
- On the main thread, the tools saved nothing on Sonnet and cost 23% more on Opus, which still sent the scout. The Haiku scout cost under a cent a run (#206).
- A host would add only TypeScript diagnostics at edit time. TypeScript 7's server pushes none, and Claude Code's client only receives pushes. TypeScript compile-error rounds cost at most 0.28% of spend, and every compile-error round together at most 0.98% (#207, #208).

## Decision

- **No code-intelligence tools and no host.** No role carries them, and no plugin MCP server serves them. The scout keeps discovery (CLA-0080).
- **An app enables three LSP plugins from the public `kharabasz/claude-toolkit` marketplace.** They are `csharp-ls-lsp`, `ts7-lsp` and `yaml-lsp`, enabled in the app's committed `.claude/settings.json`.
  - The marketplace is pinned with `ref` to a commit, so new plugin code reaches an app only through a reviewed change.
  - The official `csharp-lsp` and `typescript-lsp` are set to `false`, so nobody gets two servers for one file type.
  - Each developer installs the three plugins and their servers' binaries: `csharp-ls`, `typescript@7` and `yaml-language-server`. Without them the scout falls back to `Grep`.
- **Why these three:**
  - `csharp-ls-lsp` restores and loads the solution nearest the project root. The official plugin searches the whole tree, `.claude/worktrees` included, and can load a worktree's copy.
  - `ts7-lsp` runs TypeScript 7's own server, `tsc --lsp --stdio`. The official plugin needs `tsserver`, which TypeScript 7 no longer ships.
  - `yaml-lsp` validates workflows, Compose files and Dependabot config against their schemas, and its diagnostics reach the model after each edit.
  - Only C# and YAML diagnostics reach the model. TypeScript type errors show up in the verify script's build (CLA-0076).
- **Node scripts carry a `jsconfig.json`** with `allowJs` and without `checkJs`, so that `findReferences` sees all of `scripts/` and not one file at a time.
- **What reopens it:**
  - a Claude Code release that pulls diagnostics;
  - a transcript spike that finds compile-error rounds the plugins miss above 2% of spend, the bar of CLA-0094;
  - a benchmark arm that lowers cost per accepted task (CLA-0088).

  A later host starts from the server choices and edit rules that #203 and #207 settled.

## Consequences

- Sessions keep today's cost and discovery path. Claudalisk carries no hook, daemon or MCP server for code intelligence.
- Developers keep six install steps: three plugins and three server binaries.
- TypeScript edits get no diagnostics before the build.
