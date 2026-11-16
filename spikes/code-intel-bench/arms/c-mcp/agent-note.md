This tool answers questions about C# and TypeScript code by script, so use it instead of reading whole files to trace, rename or edit a symbol: ${mcpTools}. Its code is the body of an async function with `ci` and `print`; only what it prints and returns comes back.

- ci.find|definition|implementations|callers|callees|references|diagnostics(name) return text
- ci.rename(name, newName), ci.replaceBody(name, body)
- ci.matches(name) returns [{qualified, kind, path, line}]
- name is Namespace.Type.Member (C#) or folder/or/file:exportedName (TypeScript)
