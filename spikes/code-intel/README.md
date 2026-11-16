# Code-intelligence interfaces spike

Three ways for an agent to ask about code and edit it through the language servers of CLA-0089, built for the benchmark of epic #200. Each is exposed as an MCP server and as a CLI. The decision they feed is CLA-0088; the numbers are in `RESULTS.md`.

Roslyn serves C# and `tsc --lsp` serves TypeScript. Both are started lazily, once per project root, on the first request for their language, through `../lsp-host/lib`. The root is `CLAUDE_PROJECT_DIR`, else the current folder. The servers' binaries come from `../lsp-host` (its `node_modules` and `.config/dotnet-tools.json`), not from the project.

## The interfaces

- **A, positions** (`a/`): `definition`, `references`, `implementations`, `callers`, `callees`, `rename`, `diagnostics`, `symbols`. Arguments are `file line character`, 1-based as `Read` shows them. Output is `path:line` lists grouped by file.
- **B, symbol names** (`b/`): `find`, `definition`, `implementations`, `callers`, `callees`, `references`, `rename`, `replaceBody`, `diagnostics`. The argument is a name path: `Ordering.Order.Place` for C# (namespace, type, member; any trailing part works, and earlier parts may skip namespace segments, so `Ordering.Order` finds `Bench.Modules.Ordering.Domain.Order`) or `entities/order:useOrder` for TypeScript (a folder or file path, a colon, the exported name). A name that matches several symbols is refused with up to ten candidates. `rename` renames all overloads of a method and writes the files; `replaceBody` swaps a method or function body without the file being read; `references` is re-queried until two consecutive counts match.
- **C, REPL** (`c/`): `run(code)`. The snippet is the body of an async function with `ci` (the B operations, and `ci.matches(name)` for plain data) and `print`. It runs in a worker thread inside a `node:vm` context with no `process`, `require`, `import()`, timers or code generation from strings, for at most 30 s. Only what it prints and returns comes back, cut at a fixed size.

## Run

```
npm ci --prefix ../lsp-host
dotnet tool restore --tool-manifest ../lsp-host/.config/dotnet-tools.json
node b/cli.mjs find Ordering.Order.Place
node a/cli.mjs references src/entities/order/model/use-order.ts 6 17
node c/cli.mjs run "print(await ci.references('entities/order:useOrder'))"
node b/cli.mjs stop
```

The CLI talks to a background host for the root (`lib/daemon.mjs`) over a named pipe on Windows or a unix socket in the temporary folder elsewhere. The first call starts it, detached; it exits after 15 idle minutes, on `stop`, or within five seconds of its root folder being deleted (it runs in the temporary folder, so it never holds the root open). A cold Roslyn start takes about ten seconds on a small solution, so the host keeps it warm.

The MCP servers (`a/mcp.mjs`, `b/mcp.mjs`, `c/mcp.mjs`) speak newline-delimited JSON-RPC on stdio and hold their workspace for the life of the process. `exposure/` has the `.mcp.json` fragment of each and the skill text that tells an agent the CLI commands. Every tool carries `annotations: { readOnlyHint }` in `tools/list`: `rename` and `replaceBody` are `false`, the rest `true`, and C's `run` is `false`. `c/mcp.mjs --read-only` serves `readTools`, a `run` whose `ci` has no edit operations and which is marked `true`. The plugin's root `.mcp.json` is untouched; the benchmark arms add these through their own staged plugin.

## Test

```
node --test test/unit/*.test.mjs
node --test --test-concurrency=1 test/integration/*.test.mjs
```

The unit tests use fakes and need no .NET. The integration tests start the real servers on a small generated fixture and cover B `find`, `references`, `rename`, `replaceBody` and `diagnostics` for both languages, A `references` and `definition`, a C snippet, and one MCP and one CLI round trip. `test/integration/bench-fixture.test.mjs` runs B and A `references` for a C# and a TypeScript symbol, and an MCP round trip, on a copy of the benchmark fixture (`../code-intel-bench/fixture.json`, or one built on the spot); it skips with a loud message when the fixture cannot be built. Run them locally; spikes have no CI job.

## Measure

```
node measure-schema.mjs
node measure-schema.mjs --write
```

Prints, for each interface and exposure, the tool count, the `tools/list` bytes (MCP) or skill text bytes (CLI) and an estimate of tokens (bytes divided by four). `--write` updates the table in `RESULTS.md`. The benchmark gives the real token figures.

## Limits of the spike

- A file changed on disk is sent to the server again before the next request that names it. Other files changed outside the host are not watched.
- `replaceBody` finds the body by scanning the declaration; a TypeScript return type written as an object literal before the body can fool it.
- Output lists no source text, only locations, so an agent reads a file when it needs the code.
