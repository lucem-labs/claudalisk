# Language-server host spike

Drives csharp-ls, Roslyn's language server and TypeScript 7's language server over stdio from Node, applies the edits they return, and measures them. The decision it feeds is CLA-0089. The numbers are in `RESULTS.md`.

- `lib/rpc.mjs`: JSON-RPC 2.0 client with `Content-Length` framing, no dependency.
- `lib/edits.mjs`: the workspace-edit applier and its refusal rules.
- `lib/servers.mjs`: the three launchers. The two dotnet tools are pinned in `.config/dotnet-tools.json`, TypeScript in `package.json`.
- `lib/cases.mjs`: the cases, run by `measure.mjs` and, for a smoke check, by `smoke.test.mjs`.
- `fixtures/`: the C# and TypeScript cases added to the app that `tools/new-app.mjs` generates.

```
npm ci
dotnet tool restore
node --test --test-concurrency=1 *.test.mjs
node measure.mjs
node render-results.mjs
```

`LSP_HOST_WORK` sets the folder for the generated app, `LSP_HOST_BASE_APP` reuses one.

The numbers behind CLA-0089 are `RESULTS.md`, rendered from `results/<os>.json`, which CI uploads as the `lsp-host-results-<os>` artifacts.
