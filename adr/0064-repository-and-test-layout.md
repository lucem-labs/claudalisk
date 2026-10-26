# CLA-0064: Every app has the same repository layout, with a test project per module

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the scaffold; architecture tests (every module has a test project); the skills' `paths`

## Context

Skills load by file path, and several ADRs assume folder names, but no ADR fixed the layout.

## Decision

- **The repository root holds:**
  - `backend/`: `<Root>.slnx` and every .NET project;
  - `frontend/`: the Vite app, with its source in `src/` (CLA-0036) and its Playwright tests in `e2e/`;
  - `scripts/`: the environment scripts (CLA-0027);
  - `compose.*.yml`, `.github/`, `AGENTS.md` and `README.md`.
- **Each module has its own test project,** `<Root>.Modules.<Name>.Tests`, next to its other projects. It tests the module's implementation, Domain and Persistence projects. Its folders mirror the module's features (CLA-0047), such as `Features/CancelOrder/`.
- **Other implementation projects get a test project when they have code to test,** named after the project plus `.Tests`, such as `<Root>.Api.Tests` for the Host's endpoints and composition (CLA-0004).
- **`<Root>.ArchitectureTests`** holds the architecture tests (CLA-0006).
- Frontend unit tests sit next to the code they test, as `*.test.ts` (CLA-0065).
- Module discovery by convention (CLA-0006) ignores projects that end in `.Tests`.

## Consequences

- A module's tests move, split and are deleted together with the module.
- A test run can build and test one module alone.
- There are more projects to build, so CI builds the solution once and runs the test projects in parallel (CLA-0034).
