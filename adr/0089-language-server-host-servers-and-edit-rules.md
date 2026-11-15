# CLA-0089: The host drives Roslyn's server for C# and TypeScript 7's server for TypeScript, and applies their edits by fixed rules

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); `spikes/lsp-host` tests on ubuntu, windows and macos, including the edit-applier rules and the capability probe
- **Issue:** #203, #200

## Context

CLA-0088 plans a live language-server host per worktree (X1) that drives the servers directly, because Claude Code's `LSP` tool has no rename, code action or file-rename. The choice of csharp-ls as the C# server was never recorded. It came in with CLA-0080, inherited from the official `csharp-lsp` plugin, and Roslyn's own server was never compared with it.

The spike in `spikes/lsp-host` drives csharp-ls 0.28.0, `roslyn-language-server` 5.13.0-1.26514.10 and `tsc --lsp --stdio` 7.0.2 over stdio from a Node client with no dependency. The two dotnet tools are pinned in a tool manifest and TypeScript in the spike's `package.json`. The fixture is the app from `tools/new-app.mjs` plus small C# and TypeScript cases: overloads, an interface with two implementations, a partial class, a record property, a regex and a JSON context that source generators fill in, a barrel `index.ts`, and a file rename. After every edit the spike builds and runs the tests (`dotnet build` and the cases' test project, or `tsc -b` and the unit tests), and a case passes only when they pass and the expected sites changed. The numbers below come from the CI run on `cfa7ac8`: https://github.com/lucem-labs/claudalisk/actions/runs/43742823231. The full tables are in `spikes/lsp-host/RESULTS.md` and the three `results/<os>.json` files.

What the three OSes showed:

- **Correctness was the same on ubuntu, windows and macos.** There are 18 C# cases per server and 13 TypeScript cases.
  - Roslyn: 17 pass, 1 fails (change signature).
  - csharp-ls: 15 pass, 1 unsupported (rename file), 2 fail (move type, change signature).
  - TypeScript: 8 pass, 5 unsupported (type hierarchy, extract, inline, move, change signature).
- **Cold start**, from process spawn to the first `findReferences` whose locations are exactly the expected ones and the same on two consecutive answers. Median over the cases, in ms, on linux, macos and windows:

  | Server | linux | macos | windows |
  |---|---|---|---|
  | csharp-ls | 6570 | 6405 | 13182 |
  | Roslyn | 4866 | 5596 | 9653 |
  | TypeScript | 259 | 300 | 462 |

  Across three CI runs of the same code, the C# medians ranged from 4167 to 13182 ms and TypeScript's from 207 to 462 ms. Roslyn's median was below csharp-ls's in 8 of the 9 pairs of an OS and a run. The solution has 12 projects.
- **Warm latency**, 25 runs on a loaded server. `findReferences` median and p95 in ms: csharp-ls 2.3 and 2.7 on linux, 3.3 and 5.3 on windows; TypeScript 0.9 and 1.2 on linux, 1.7 and 1.9 on windows; Roslyn 503 and 504 on linux, 506 and 510 on windows, 591 and 662 on macos. The Roslyn figure is the same on every OS, so it looks like a fixed wait in the server and not load. Its cause was not investigated. `prepareRename` took 0.2 to 1.7 ms median on every server.
- **Resident memory** of the server process tree, in MB, after load and highest at the end of a case: csharp-ls 370 to 451 and up to 496, Roslyn 390 to 455 and up to 918 (macos), TypeScript 195 to 260 and up to 518.

## Decision

- **The C# server is Roslyn's own, `roslyn-language-server`.**
  - It passes every case csharp-ls passes and two more. Its "Rename file to X.cs" and "Move type to X.cs" code actions return real RenameFile and CreateFile operations. csharp-ls offers the first with an empty edit, and sends the second as a text edit for a file that does not exist, with no CreateFile.
  - It renames only the overload under the cursor. csharp-ls renames every overload, which a model asking for one rename does not expect.
  - It returns references that lie in source-generated files, as `roslyn-source-generated://` URIs. csharp-ls returns none, so a rename or a reference count that depends on generated code is silent there.
  - Its cold start is lower. Its warm `findReferences` is about 0.5 s a call, which is acceptable for a tool call a model makes, and its memory is higher.
  - It is published only as a prerelease, so the host pins an exact version in a tool manifest, and a generated app's CI gets the tool from the DinD runner image (CLA-0088). csharp-ls stays what CLA-0080's `LSP` plugin runs until the host replaces it.
  - The host must open the solution with the `solution/open` notification, wait for `workspace/projectInitializationComplete` and answer `workspace/configuration`, `client/registerCapability` and `window/workDoneProgress/create`. Some actions, such as "Add parameter", arrive as a command `roslyn.client.nestedCodeAction` that carries child actions. The host resolves a child with `codeAction/resolve` and applies its edit.
- **The TypeScript server is `tsc --lsp --stdio` from the `typescript` package, pinned exactly.** The generated app's own `tsc -b` ran on 6.0.3 and passed after edits made by the 7.0.2 server, so the two versions are independent.
  - Rename returns `changes`. By default it keeps a barrel's public name: renaming `formatPrice` gives `export { renderPrice as formatPrice }` and leaves importers alone. Answering `workspace/configuration` with `typescript.preferences.useAliasesForRenames: false` renames every site. The host asks for the second form and says so.
  - It sends diagnostics only when asked (`textDocument/diagnostic`). Source actions come back only when the request lists them in `only`. At the error sites of the cases it returned no quick fix.
  - It does not advertise type hierarchy, and offers no extract, inline or move.
- **Both C# servers and TypeScript's push no diagnostics to this client within 20 s of an edit that breaks the build.** All three answer `textDocument/diagnostic` with the error. The host pulls diagnostics for D2 and does not wait for a push.
- **The host applies a `WorkspaceEdit` by these rules.** `spikes/lsp-host/lib/edits.mjs` implements them and `spikes/lsp-host/edits.test.mjs` has a test for each.
  - **Shapes:** `changes`, `documentChanges` with `TextDocumentEdit`, and the resource operations `CreateFile`, `RenameFile` and `DeleteFile` with `overwrite`, `ignoreIfExists`, `ignoreIfNotExists` and `recursive`. The client advertises `failureHandling: abort`.
  - **Positions are UTF-16 code units.** A character past the end of a line is clamped to the end. A line past the end of the document is refused.
  - **Edits in one document apply from the end to the start.** Inserts at one position keep the order they were sent in.
  - **Overlapping edits are refused.** Edits that only touch are allowed.
  - **Every URI must be a `file:` URI inside the workspace root.** Anything else is refused, including source-generated documents and a path that leaves the root.
  - **A `TextDocumentEdit` version must match the open document.** A version for a document that is not open is refused. A null version skips the check.
  - **`CreateFile` onto an existing file and `RenameFile` onto an existing file are refused unless `overwrite` is set.** `ignoreIfExists` skips the operation. A missing source, a text edit for a missing file, and a folder rename are refused. `DeleteFile` of a missing file is refused unless `ignoreIfNotExists` is set, and of a folder unless `recursive` is set.
  - **Nothing is written when anything is refused.** The host checks every operation against an in-memory copy of the files, where a later operation sees an earlier one, and writes only after all of them pass.
  - **Line endings and a byte order mark are kept as found.** Inserted text takes the document's first line ending.
  - **After a write, the host sends `workspace/didChangeWatchedFiles`, and a full-text `textDocument/didChange` with the next version for each open document.** A refused edit that came as `workspace/applyEdit` is answered with `applied: false` and the reason.
- **Build and test after every edit.** A host edit tool reports success only when `dotnet build` and the tests, or `tsc -b` and the unit tests, pass. A server answering is not evidence.
- **The catalogue rows are amended by id:**
  - **N5, type hierarchy:** build for C# on both servers, which returned the right subtypes and supertypes of an interface and its implementations. TypeScript's server does not advertise it, so no N5 for TypeScript.
  - **E2, rename or move a file or type:** build for TypeScript through `workspace/willRenameFiles` followed by a RenameFile (imports in the barrel and the test were updated, `tsc -b` and the tests passed), and for C# on Roslyn through "Rename file to X.cs" and "Rename type to X". Not built on csharp-ls. The spike renamed files in place only, so moving a file to another folder or namespace is not shown.
  - **E3, change signature:** not available from code actions. At a call with an extra argument both C# servers offer "Add parameter", which changes one declaration and leaves other callers broken, and the build failed on all three OSes. TypeScript offers nothing. Claudalisk would build it as its own tool over references and edits, if the benchmark calls for it.
  - **E6, organize imports, fix all, quick fixes:** build the kinds each server returns. Applied and passing: TypeScript's `source.organizeImports` and `source.removeUnusedImports`, and "Remove unnecessary usings" on both C# servers. Roslyn also offers "Fix All" quick fixes, which the spike listed and did not apply. TypeScript advertises `source.fixAll` and returned none in the cases.
  - **E7, extract, inline, move:** build for C#. "Extract method" and "Inline temporary variable" were applied on both servers and passed. "Move type to file" passes on Roslyn only. TypeScript's server offers none.
  - **X2, persistent index:** cold start calls for none. On this 12-project solution the first correct answer took 4 to 13 s for C# and under 0.5 s for TypeScript, and later calls are fast. The host keeps the server running (X1). X2 is reconsidered only if the benchmark in #202 shows a larger solution waiting long on first use.

## Consequences

- The host depends on a prerelease tool. A version bump is a change to the tool manifest and the DinD image together, and the spike's CI job on three OSes is the check that the new version still passes.
- The host carries server-specific duties: the Roslyn start sequence and nested actions, TypeScript's `only` filter and rename configuration. Each is covered by a case in the spike.
- A rename tool must report which overloads, and which generated or non-file locations, it did not change, because the two C# servers differ and generated sites cannot be edited.
- The generated app's frontend step that writes API types needs a container runtime, which the windows and macos runners lack. The spike uses a committed copy of the generated schema there.
- `spikes/lsp-host` stays as the harness to re-measure after a server upgrade, and its fixture is the same app that #202 builds its benchmark on.
