---
name: code-intel-c
description: Code intelligence by script. Use to chain several symbol lookups or edits in one JavaScript snippet over C# and TypeScript code.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/c/cli.mjs run "<code>"`. The code is the body of an async function with `ci` and `print`; only what it prints and returns comes back.

- ci.find|definition|implementations|callers|callees|references|diagnostics(name) return text
- ci.rename(name, newName), ci.replaceBody(name, body)
- ci.matches(name) returns [{qualified, kind, path, line}]
- name is Namespace.Type.Member (C#) or folder/or/file:exportedName (TypeScript)
