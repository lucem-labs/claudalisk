Run `node ${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/b/cli.mjs <op> <name>` to answer questions about C# and TypeScript code by symbol name. A name is Namespace.Type.Member for C# (any trailing part) or folder/or/file:exportedName for TypeScript. An ambiguous name is refused with its candidates. It is the only command available to you: one command per call, no pipes, redirects or chaining.

- find|definition|implementations|callers|callees|references|diagnostics <name>
