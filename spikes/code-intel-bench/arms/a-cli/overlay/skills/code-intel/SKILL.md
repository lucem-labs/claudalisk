---
name: code-intel-a
description: Code intelligence by position. Use to find definitions, references, implementations, callers, callees, to rename a symbol or to list diagnostics in C# and TypeScript.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/a/cli.mjs <op> <args>`. file is relative to the project root, line and character are 1-based.

- definition|references|implementations|callers|callees <file> <line> <character>
- rename <file> <line> <character> <newName>
- diagnostics <file>
- symbols <file>
- stop
