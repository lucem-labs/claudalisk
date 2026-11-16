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

Every run generates its app in a new folder under the temporary folder. `LSP_HOST_WORK` names a folder to keep, so the generated app is reused between runs and between the test and measure steps (CI sets it); the folder is reused only when its `.lsp-host-ready` marker, which is written last, exists, and a half-built base is deleted and generated again. `LSP_HOST_BASE_APP` reuses an app generated elsewhere.

A case's edits are checked with a build of the whole `backend/Proof.slnx`, then the test projects. A test project whose sources create a PostgreSQL database needs a Linux container runtime; where `docker info` does not answer `linux`, it is not run, and the result files name it under `verification.skipped`.

`npm run api:types` needs a container runtime too. Where none answers, `lib/no-docker.mjs` logs it and copies `fixtures/generated/schema.d.ts` instead. Regenerate that file, by running `npm run api:types` where a container runtime answers and copying `src/shared/api/schema.d.ts`, whenever the template's backend endpoints or their contracts change.

The numbers behind CLA-0089 are `RESULTS.md`, rendered from `results/<os>.json`, which CI uploads as the `lsp-host-results-<os>` artifacts.
