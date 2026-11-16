Run `node ${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/a/cli.mjs <op> <args>` to answer questions about C# and TypeScript code by position. file is relative to the project root, line and character are 1-based. It is the only command available to you: one command per call, no pipes, redirects or chaining.

- definition|references|implementations|callers|callees <file> <line> <character>
- diagnostics <file>
- symbols <file>
