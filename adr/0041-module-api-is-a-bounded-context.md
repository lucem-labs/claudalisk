# CLA-0041: A module's API is a bounded context that speaks its ubiquitous language

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer

## Context

Claudalisk's HTTP APIs follow two books. *Domain-Driven Design* (Evans) gives the shape of the model: bounded contexts, a ubiquitous language, aggregates and commands. *RESTful Web APIs* (Richardson, Amundsen and Ruby) gives the shape of the interface: resources, hypermedia and full use of HTTP. CLA-0041 to CLA-0046 apply them together.

## Decision

- Each backend module is a bounded context (CLA-0001), and its API is that context's public face.
- Resource names, fields, commands and error types use the module's ubiquitous language: the words the owner uses for the domain. A UI or database word never stands in for a domain word.
- A resource belongs to exactly one module, and its controller lives in that module (CLA-0005). A resource never combines data that two modules own. A view that needs both is put together by the frontend (CLA-0037) or by a composition module that owns it.
- The API has no version numbers in its URLs or headers. It changes by addition: new fields, resources, links and commands. A change that breaks a client changes the frontend in the same pull request, because the frontend and backend deploy together.

## Consequences

- The names in the URL, the JSON, the C# and the conversation with the owner are the same.
- A module's API can be read on its own, without knowing the rest of the app.
- Renaming a domain concept is a deliberate change across the module's API and its frontend entity, not a local tweak.
