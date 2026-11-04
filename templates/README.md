# App templates

Files that belong in a claudalisk app, laid out as they sit in the app's repository (CLA-0064). Until the scaffold generates them, an app copies them in.

| File | What it is |
|---|---|
| `app/scripts/verify.mjs` | `node scripts/verify.mjs [-m "<message>"] [--backend] [--frontend] [--e2e] [--fail-fast] [--timeout <minutes>]`: commits, pushes, waits for CI on that commit and prints only the failures ([CLA-0076](../adr/0076-one-verify-script-per-cycle.md)) |
| `app/scripts/check-e2e-locators.mjs` | `node scripts/check-e2e-locators.mjs [<folder>]`: fails on CSS and element locators in the end-to-end tests ([CLA-0070](../adr/0070-testing-layers.md)). Without a folder it checks `frontend/e2e`, found from the script's own location. Add `node ../scripts/check-e2e-locators.mjs` to the frontend's `lint` script |
| `app/scripts/trx-annotations.mjs` | Run in CI: turns the failing tests of .NET TRX reports into annotations and a job summary |
| `app/scripts/no-comments.mjs` | `node scripts/no-comments.mjs [<root>] [--skip <path>]...`: fails when a tracked file has a comment ([CLA-0035](../adr/0035-no-code-comments.md)) |
| `app/scripts/install-security-tools.mjs` | `node scripts/install-security-tools.mjs --tool <name>[,<name>]... [--destination <folder>]`: downloads gitleaks, OSV-Scanner, Trivy, zizmor or uv at a pinned release, refuses a download whose SHA-256 differs, installs into a new folder under `RUNNER_TEMP` unless `--destination` names one, and adds the folder to `GITHUB_PATH` ([CLA-0071](../adr/0071-security-scans.md)) |
| `app/scripts/scan-images.mjs` | `node scripts/scan-images.mjs [--build] [--scan] --image <name>=<Dockerfile>...`: builds the images, then scans each one with Trivy from a `docker save` archive. The build context is the Dockerfile's top folder, `backend` or `frontend` |
| `app/scripts/zap-baseline.mjs` | `node scripts/zap-baseline.mjs --target http://<app>.dev.localhost [--proxy-host <IPv4 address>]` (without it, `host.docker.internal`): runs the ZAP baseline against dev with `.zap/rules.tsv`, and refuses any other target and a proxy address outside loopback and the private ranges |
| `app/scripts/*.test.mjs` | Their tests: `node --test scripts/*.test.mjs` |
| `app/frontend/.oxlintrc.json` | The frontend's oxlint configuration ([CLA-0065](../adr/0065-frontend-tooling.md)). It keeps `fetch` inside `src/shared/api` ([CLA-0014](../adr/0014-frontend-stack-and-api-module.md)) and turns `react/only-export-components` off in `src/shared/ui`, where shadcn's components export their variants beside them, so the warning stays meaningful everywhere else |
| `app/.github/workflows/security.yml` | The weekly `security` workflow: the dependency rescans, the image scans and the ZAP baseline |
| `app/.zap/rules.tsv` | The ZAP rules file, with the three informational rules every single-page app trips set to `INFO` |
| `app/.github/zizmor.yml` | zizmor's config: `lucem-labs/*` actions may be pinned to a tag, every other action to a commit SHA |
| `app/osv-scanner.toml`, `app/.trivyignore.yaml` | The OSV-Scanner and Trivy suppression files, empty |
| `app/backend/Root.Api/Dockerfile`, `app/backend/.dockerignore` | The API image, at `backend/<Root>.Api/Dockerfile` in the app |
| `app/frontend/Dockerfile`, `app/frontend/.dockerignore`, `app/frontend/nginx.conf` | The frontend image and its server |

## Comment check

CLA-0035's CI check is `no-comments.mjs`. It reads the files `git ls-files` lists and needs no packages, so it doesn't depend on a linter or test runner staying in the app. It covers:

| Files | Comments it finds |
|---|---|
| `.cs` | `//`, `///` and `/* */`, outside strings, verbatim and raw strings |
| `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` | `//` and `/* */`, outside strings, template literals and regular expressions |
| `.css` | `/* */` |
| `.sql` | `--` and `/* */`, outside strings, `E'…'` strings and dollar quotes |
| `.json`, `.jsonc` | `//` and `/* */` |
| `.csproj`, `.props`, `.targets`, `.slnx`, `.config`, `.xml`, `.html` | `<!--` |
| `.yml`, `.yaml` | `#` at the start of a line or after a space, outside quotes and block scalars (`|`, `>`) |
| `.toml`, `.conf` | `#` at the start of a line or after a space, outside quotes |
| `.gitignore`, `.gitattributes`, `.dockerignore` | `#` at the start of a line |
| `.editorconfig` | `#` or `;` at the start of a line |
| `Dockerfile`, `Dockerfile.*`, `*.Dockerfile` | `#` at the start of a line |

It allows the exceptions CLA-0035 lists:

- shebangs;
- lint suppressions (`eslint-disable`, `oxlint-disable` and their `-enable`, `-line` and `-next-line` forms, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`, `ReSharper disable` and `restore`) and `/// <reference />`;
- a bare `/// <inheritdoc />` in a migration file (`Migrations/<14-digit timestamp>_<name>.cs`);
- `syntax=`, `escape=` and `check=` parser directives in the leading lines of a Dockerfile;
- EF Core designer files and model snapshots, and files that start with a generated-file header (`<auto-generated`, `This file was auto-generated`, `@generated`).

Name any other vendored or generated file or folder with `--skip`, such as `--skip frontend/.claude/skills/shadcn`, or a generated API types file whose generator writes no header. A migration that has run (applied to uat or tracked on `origin/main`), or SQL it runs, is never edited to pass the check: name it with `--skip` (CLA-0010). In GitHub Actions the checker also writes an `::error` annotation for each comment, so `verify.mjs` can print it. Markdown is documentation and isn't checked. In JSX text, write `//`, `/*` and a backtick as strings, such as `{'//'}`: the checker reads them as code.

When a file type the app uses isn't in the table, add it to the checker in claudalisk.

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
- Run `node scripts/no-comments.mjs` as a step of its own, with a `--skip` for each generated or vendored path.
- Keep every step's `run` to one line ([CLA-0027](../adr/0027-scripts-in-node.md)). Anything longer goes into a tested script under `scripts/`.

## Security jobs

CLA-0071's scans run on the shared self-hosted runners (CLA-0033). Those runners use a Docker-in-Docker sidecar, which doesn't share the job's workspace with the Docker daemon: container actions and `docker run -v "$PWD"` see an empty folder. So the scanners avoid mounts:

- gitleaks, OSV-Scanner, Trivy, zizmor and uv are release binaries that `install-security-tools.mjs` checks against a SHA-256 before they run. Each run installs them into a new folder of its own, so nothing left on a shared runner lands on `PATH`. To move a scanner to a new release, change its URL and SHA-256 in that script, in claudalisk first.
- Semgrep runs through `uv` at a pinned version, on a pinned Python. The runner image has no Python, and an unpinned `uv` picked a pre-release that one of Semgrep's dependencies has no wheel for. `UV_EXCLUDE_NEWER` makes uv resolve Semgrep's dependencies as they were on that date, so a release published later can't reach the job. Move it forward together with `SEMGREP_VERSION`. Unlike the binaries, these packages aren't checked against a SHA-256 of ours: PyPI's own hashes are the check. The `p/csharp` and `p/typescript` rule packs also come from the Semgrep registry on each run, unpinned. The `UV_*` and `TRIVY_CACHE_DIR` folders under `RUNNER_TEMP` keep uv's cache, tools and Python, and Trivy's vulnerability database, out of the runner's home folder, where another job's could be reused.
- Trivy scans images from `docker save` archives, not from the daemon.
- ZAP gets its rules on stdin and writes its report to a `tmpfs` folder. The script prints the report to the log, and to the job summary when it runs in GitHub Actions.

The `security` job in `ci.yml` runs beside the test jobs. Add the app's forbidden-file, source-hygiene and suppression checks to it as steps of their own:

```yaml
security:
  runs-on: ${{ fromJSON(vars.CI_RUNS_ON || '["self-hosted","linux","ci"]') }}
  timeout-minutes: 30
  permissions:
    contents: read
  defaults:
    run:
      shell: bash
  env:
    DOTNET_NOLOGO: "1"
    DOTNET_CLI_TELEMETRY_OPTOUT: "1"
    SEMGREP_VERSION: "1.182.0"
    UV_EXCLUDE_NEWER: "2026-11-01T00:00:00Z"
    UV_PYTHON_PREFERENCE: only-managed
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      with:
        fetch-depth: 0
        persist-credentials: false
    - uses: actions/setup-dotnet@a98b56852c35b8e3190ac28c8c2271da59106c68
      if: runner.environment == 'github-hosted'
      with:
        dotnet-version: 10.0.x
    - name: Install scanners
      id: tools
      run: node scripts/install-security-tools.mjs --tool gitleaks,osv-scanner,trivy,zizmor,uv
    - name: Secrets (gitleaks)
      if: ${{ !cancelled() && steps.tools.outcome == 'success' }}
      run: gitleaks git --redact --exit-code 1 .
    - name: NuGet packages
      if: ${{ !cancelled() }}
      uses: lucem-labs/nuget-audit-action@v1
      env:
        NuGetAudit: "false"
      with:
        path: backend/<Root>.slnx
    - name: npm packages (OSV-Scanner)
      if: ${{ !cancelled() && steps.tools.outcome == 'success' }}
      run: osv-scanner scan --config osv-scanner.toml --lockfile frontend/package-lock.json
    - name: Code (Semgrep)
      if: ${{ !cancelled() && steps.tools.outcome == 'success' }}
      env:
        UV_CACHE_DIR: ${{ runner.temp }}/uv-cache
        UV_TOOL_DIR: ${{ runner.temp }}/uv-tools
        UV_PYTHON_INSTALL_DIR: ${{ runner.temp }}/uv-python
      run: uv tool run --python 3.13 --from "semgrep==$SEMGREP_VERSION" semgrep scan --config p/csharp --config p/typescript --metrics=off --error --quiet
    - name: Workflows (zizmor)
      if: ${{ !cancelled() && steps.tools.outcome == 'success' }}
      env:
        GH_TOKEN: ${{ github.token }}
      run: zizmor --config .github/zizmor.yml .github/workflows
    - name: Dockerfiles (Trivy)
      if: ${{ !cancelled() && steps.tools.outcome == 'success' }}
      env:
        TRIVY_CACHE_DIR: ${{ runner.temp }}/trivy-cache
      run: trivy config --exit-code 1 --ignorefile .trivyignore.yaml .
```

- The gitleaks step scans the whole history on every push. An app that scans only the pushed commits replaces it with a script of its own that takes `github.event.before`, through `env`, never inline.
- `NuGetAudit: "false"` stays on the audit step until lucem-labs/nuget-audit-action#1 is fixed. With warnings as errors, the action's second restore fails on a vulnerable package and reports "Restore failed" instead of the advisory. The build's own NuGet audit (NU1901 to NU1904) stays on, so a vulnerable package still fails the build.
- `!cancelled()` lets every scan run after another one fails, so one run shows all the findings.

The weekly `security.yml` repeats the dependency scans, builds and scans the images, and runs the ZAP baseline:

- The image scan fails on fixable HIGH and CRITICAL vulnerabilities in the images, in their OS packages and in the libraries the app ships (`--severity HIGH,CRITICAL --ignore-unfixed`). A finding with no fixed release can't be acted on until one exists. When one appears, the next weekly run fails.
- The base images are tagged by major version, not by digest, and `--pull` takes the latest patch each week. Dependabot raises the major version in a pull request of its own (CLA-0072).
- The `zap` job runs only on the self-hosted `ci` runner on the owner's PC, where dev and the proxy run, so it doesn't read `CI_RUNS_ON` and never falls back to GitHub-hosted runners. dev may hold data refreshed from uat (CLA-0032), and the report quotes what ZAP saw, so the job summary may show it. The runners serve only private repositories (CLA-0033).
- GitHub dispatches a workflow only once it is on the default branch. To try a change to it before the merge, push it to a throwaway branch with a temporary `push` trigger, and delete the branch afterwards.

## Images

Trivy's config scan fails on a container that runs as root and on an image without a `HEALTHCHECK`. The template images pass it:

- The API runs as the ASP.NET image's non-root `app` user (`USER $APP_UID`) on port 8080. Its `HEALTHCHECK` runs the API's own binary with `--health-check`, which calls the health endpoint and exits 0 or 1. The runtime image has no `curl`, so the check needs no extra tools. Until `Claudalisk.AspNetCore` provides the argument, the Host handles it first thing in `Program.cs`, before it builds the app. Without it the check starts a second server, which can't bind the port, and the container never becomes healthy:

  ```csharp
  if (args.Contains("--health-check", StringComparer.Ordinal))
  {
      var port = (Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") ?? "8080").Split([';', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault() ?? "8080";
      using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(5) };
      try
      {
          using var response = await client.GetAsync(HealthEndpoint.Path);
          Environment.ExitCode = response.IsSuccessStatusCode ? 0 : 1;
      }
      catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
      {
          Environment.ExitCode = 1;
      }
      return;
  }
  ```

- The one-shot `migrate` service runs the API image with `healthcheck: disable: true` in Compose.
- The frontend is served by `nginx/nginx-unprivileged` on port 8080, as the `nginx` user, and its `HEALTHCHECK` is a `wget` of the page. `nginx.conf` proxies `/api` and `/openapi` to the Compose service named `api`.
- The `.dockerignore` files keep `bin`, `obj`, `node_modules`, `dist`, env files and `*.local.json` files out of the build context. A Vite build bakes the `VITE_*` values of a `.env.local` into the bundle.

### Security headers

`nginx.conf` sends the security headers the ZAP baseline checks for on every response, a Content Security Policy among them.

- nginx drops the server's `add_header` lines in a `location` that has its own. So the locations add none, and a location that needs a header of its own repeats every server-level line. For caching, use `expires`, which isn't an `add_header`: `index.html` is never cached, so a deploy reaches the browser at once.
- `/assets/` answers 404 for a missing file, so a stale chunk after a deploy fails as a missing file, not as `index.html` with the wrong type. Other paths fall back to `index.html` for the client-side routes.
- The CSP allows no inline script or style. Some components inject a `<style>` element at runtime: Radix's scroll lock behind dialogs and sheets, sonner and shadcn's chart. Check the browser console for CSP violations after adding a UI library, and fix one with that style's `'sha256-…'` source or a nonce, in the one directive at fault. `'unsafe-inline'` is never the fix, and ZAP flags it.
- When the app loads images or fonts from another host, add that host to `img-src` or `font-src`, and nothing wider. `Cross-Origin-Embedder-Policy: credentialless` loads such images without cookies, and a font from another host needs CORS headers there.
- The template serves no Swagger UI through the frontend. Its inline scripts need a CSP of their own, in a `location` of their own.

## Running the ZAP baseline by hand

In CI the script reaches dev through `host.docker.internal`, which the containers resolve to the machine-wide proxy (CLA-0033). On a Windows host with Docker Desktop that name resolves inside containers but not on the host, and the proxy listens only on `127.0.0.1`, so the host's LAN address doesn't work either. Pass the address Docker Desktop gives containers for the host, read in the same pinned image the script runs (`ZAP_IMAGE` in the script):

```powershell
$image = 'ghcr.io/zaproxy/zaproxy:2.17.0@sha256:030d3df57735dacbb83464854758e674dd9ad01d79d12a129a8e58b1fd384238'
$proxy = (docker run --rm --entrypoint getent $image hosts host.docker.internal).Split(' ')[0]
node scripts/zap-baseline.mjs --target http://<app>.dev.localhost --proxy-host $proxy
```
