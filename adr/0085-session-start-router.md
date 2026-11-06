# CLA-0085: A session-start hook prints what dev and uat run and points to the workflow skill

- **Status:** accepted
- **Date:** 2026-11-06
- **Area:** environments
- **Enforced by:** `hooks/session-start.mjs` and its tests in CI's `adrs` job
- **Issue:** #12

## Context

A session starts without knowing which commit dev and uat run, which pull request uat shows or whether the owner is waiting to review it. The health endpoint every app has (CLA-0029) answers the first question, and the review deploy records the rest on GitHub (CLA-0030). The workflow skill (CLA-0073) loads only from its description until something points to it. Windows CLI tools do not resolve `*.localhost`, so a client has to connect to 127.0.0.1 itself.

## Decision

- **A `SessionStart` hook prints one short block as `additionalContext`, and only inside a claudalisk app** (the `.claude/claudalisk.json` marker, found the way the guardrail finds it, CLA-0083). Outside an app it prints nothing.
- **The block holds:**
  - a pointer to the `claudalisk:workflow` skill, to read before starting an issue (CLA-0073);
  - that the app's `AGENTS.md` holds its facts and deviations and wins (CLA-0028);
  - `dev runs <ref>@<sha7>; uat runs <ref>@<sha7>`, from `GET /api/health` on `<hostPrefix>.dev.localhost` and `<hostPrefix>.uat.localhost`;
  - the current branch and its open pull request number, if any;
  - the open pull request whose head is the ref uat runs, and that it awaits the owner's review.
- **The hook connects to 127.0.0.1 and sends the name in the `Host` header,** the way `curl --resolve` does, on the port the proxy registration records, 80 by default. The two requests run in parallel with a 500 ms timeout each. An environment with no answer reads `dev is down` or `uat is down`.
- **A 503 still has a JSON body,** so the hook reports the ref and sha the body gives, with the status code and state.
- **When uat gives no answer, the hook falls back to the latest GitHub `uat` deployment** (CLA-0030), read through `gh api`. A deployment's `ref` is its commit sha, so the branch and pull request come from the commit's pull requests. The line says it is the last recorded deployment and not a live reading, and a pull request found this way reads as the one uat last showed.
- **Text from the health body and GitHub is reduced to the characters a ref or state uses, with a length limit,** because it goes into the session's context. A `-dirty` sha keeps its marker.
- **`gh` runs asynchronously with a timeout of about 2 seconds,** and the hook as a whole answers within 4.5 seconds, inside the 5 second limit it is registered with. Any failure drops that one line.
- **It never blocks a session.** An unreadable input, a broken config or any other error prints nothing and exits 0.

## Consequences

- A session knows what runs where from its first turn, without a request or a Docker command.
- The block is a few lines, so it adds little to every later request (CLA-0073).
- The router reads the proxy on the registered port, 80 when the registry has none or cannot be read. The proxy port is owned by the proxy registration, and the hook follows it.
- The fallback can name a deployment that no longer runs, and says so.
