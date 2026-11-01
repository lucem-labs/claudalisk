# App templates

Files that belong in a claudalisk app, laid out as they sit in the app's repository (CLA-0064). Until the scaffold generates them, an app copies them in.

| File | What it is |
|---|---|
| `app/scripts/verify.mjs` | `node scripts/verify.mjs [--backend] [--frontend] [--e2e] [--all]`: builds, tests and lints in one call and prints only the failures ([CLA-0076](../adr/0076-one-verify-script-per-cycle.md)) |
| `app/scripts/verify.test.mjs` | Its tests: `node --test scripts/*.test.mjs` |

CI runs these tests next to the tools' tests.
