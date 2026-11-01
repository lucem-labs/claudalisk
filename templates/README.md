# App templates

Files that belong in a claudalisk app, laid out as they sit in the app's repository (CLA-0064). Until the scaffold generates them, an app copies them in.

| File | What it is |
|---|---|
| `app/scripts/verify.mjs` | `node scripts/verify.mjs [-m "<message>"] [--backend] [--frontend] [--e2e] [--fail-fast] [--timeout <minutes>]`: commits, pushes, waits for CI on that commit and prints only the failures ([CLA-0076](../adr/0076-one-verify-script-per-cycle.md)) |
| `app/scripts/trx-annotations.mjs` | Run in CI: turns the failing tests of .NET TRX reports into annotations and a job summary |
| `app/scripts/*.test.mjs` | Their tests: `node --test scripts/*.test.mjs` |

## Wiring CI

`verify.mjs` reads the failures from the annotations of the failed CI jobs, so each job has to produce them:

- Name each job after its layer, such as `backend`, `frontend` or `e2e`, so the layer flags can find it.
- Use `actions/setup-dotnet` and `actions/setup-node`. They register problem matchers that turn .NET compiler and `tsc` errors into annotations.
- Run oxlint with `--format=github`.
- Vitest adds its `github-actions` reporter in GitHub Actions. If the app sets `reporters`, list `github-actions` too.
- Give Playwright the `github` reporter in CI, such as `reporter: process.env.CI ? [['github'], ['list']] : 'list'`.
- For the .NET tests, write TRX and annotate it when the tests fail:

  ```yaml
  - name: Tests
    run: dotnet test backend --no-build --logger trx --results-directory "${{ runner.temp }}/trx"
  - name: Failing tests
    if: failure()
    run: node scripts/trx-annotations.mjs "${{ runner.temp }}/trx"
  ```

- Run `node --test scripts/*.test.mjs` in a job of its own.
