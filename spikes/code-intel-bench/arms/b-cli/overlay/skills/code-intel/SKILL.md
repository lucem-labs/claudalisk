---
name: code-intel-b
description: Code intelligence by symbol name. Use to find, trace, rename or edit a C# or TypeScript symbol without reading its file.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/b/cli.mjs <op> <name> [args]`. A name is Namespace.Type.Member for C# (any trailing part) or folder/or/file:exportedName for TypeScript. An ambiguous name is refused with its candidates.

- find|definition|implementations|callers|callees|references|diagnostics <name>
- rename <name> <newName>
- replaceBody <name> <body>
- stop
