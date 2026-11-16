Run `node ${CLAUDE_PLUGIN_ROOT}/spikes/code-intel/c/cli.mjs run "<code>"` to answer questions about C# and TypeScript code by script. The code is the body of an async function with `ci` and `print`; only what it prints and returns comes back. It is the only command available to you: one command per call, no pipes, redirects or chaining.

- ci.find|definition|implementations|callers|callees|references|diagnostics(name) return text
- ci.matches(name) returns [{qualified, kind, path, line}]
- name is Namespace.Type.Member (C#) or folder/or/file:exportedName (TypeScript)
