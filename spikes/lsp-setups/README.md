# Language-server set-ups spike

Compares three ways to give a claudalisk app its language servers and its diagnostics after an edit, on the app that `tools/new-app.mjs` generates (the same app as `spikes/lsp-host`). The decision it feeds is CLA-0092. The numbers are in `RESULTS.md`.

- **plugins**: what the wrapper plugins of CLA-0080 start. csharp-ls with `--solution` after a `dotnet restore`, `tsc --lsp --stdio`, and `yaml-language-server --stdio` with its settings.
- **lspjson**: a `.lsp.json` that claudalisk would ship. Roslyn's language server for C#, with every launch that needs no custom notification, plus the same TypeScript and YAML servers.
- **host**: the host of CLA-0089. Roslyn with `solution/open`, `tsc --lsp`, and yaml-language-server, driven with pulled diagnostics; D1 comes from a PostToolUse hook that asks a per-worktree daemon.

The first two are driven by `lib/claude-code-client.mjs`, an emulation of the language-server client in Claude Code 2.1.316 (`fixtures/claude-code-client.json` holds the capabilities it sends): push diagnostics only, `didOpen`, full-text `didChange` and `didSave`, no `solution/open`. The host is driven by the `lsp-host` client.

## Files

- `lib/`: the emulated client, the launches, the host server, the cases and the measurements. It reuses `spikes/lsp-host/lib` (JSON-RPC, solution choice, memory sampling, the generated app) by relative import.
- `host-daemon.mjs`: one daemon per worktree, on a named pipe on Windows and a unix socket under the temporary folder elsewhere, speaking line-delimited JSON (`diagnostics`, `status`, `shutdown`). It starts a server per language on first use.
- `post-edit-hook.mjs`: the PostToolUse hook. It prints `additionalContext` with `path:line:col severity code message` lines, or nothing; it never blocks an edit past `CLAUDALISK_LSP_HOOK_DEADLINE_MS` (default 3000).
- `install-step.mjs`: runs one install command and logs its seconds, so each CI install is a separate timed step.
- `measure.mjs --part attempts|correctness|worktrees|memory|hook|merge`: the measurements; `merge` writes `results/<os>.json`.
- `render-results.mjs`: renders `RESULTS.md` from `results/*.json`.

## Run

```
npm ci
dotnet tool restore
node --test --test-concurrency=1 *.test.mjs
node measure.mjs --part attempts
node measure.mjs --part correctness
node measure.mjs --part worktrees
node measure.mjs --part memory
node measure.mjs --part hook
node measure.mjs --part merge
node render-results.mjs
```

The plugins set-up uses the globally installed servers when they exist (`dotnet tool install --global csharp-ls`, `npm install -g typescript@7`, `npm install -g yaml-language-server`), as the wrapper plugins do, and the pinned ones otherwise; the results name which. `LSP_HOST_WORK` names a folder to keep the generated app between parts, as in `lsp-host`. A part that records an `error` exits with 1 after it writes its result.

Spikes have no CI job. The measurement in `RESULTS.md` came from a CI run that has since been removed; to measure again, run the steps by hand on each OS.
