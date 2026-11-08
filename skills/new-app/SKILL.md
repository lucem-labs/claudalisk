---
name: new-app
description: Generates a complete claudalisk app. Creates the .NET modular monolith, the React frontend, CI, environment scripts and end-to-end harness in a new folder, checks them, then with the owner's approval creates the private repository, its labels, registers the app on this machine and enrols it with the CI runners. Use when starting a new app.
argument-hint: "<folder> <Root> <app-name> <owner/repo>"
user-invocable: true
---

# Create a new app

## 1. Choose the names

Ask the owner for anything the arguments do not give:

| Name | Rule | Example |
|---|---|---|
| Folder | Empty or new, outside any repository | `C:\git\acme-shop` |
| Root | PascalCase, the first part of every project name | `AcmeShop` |
| App name | `^[a-z0-9][a-z0-9-]*$`, one source for the state folder and hosts (CLA-0082) | `acme-shop` |
| Repository | `owner/name`. Runners serve only private repositories (CLA-0033) | `acme/acme-shop` |
| First module (optional) | Bounded context and its first aggregate (CLA-0001, CLA-0048) | `Ordering`, `Order` |

## 2. Generate it

Docker must be running: the API types are generated from the real API on PostgreSQL. The command needs .NET 10, Node 24 and `gh` signed in.

```
node "${CLAUDE_PLUGIN_ROOT}/tools/new-app.mjs" generate <folder> --root <Root> --name <app-name> --repo <owner/repo> [--module <Name> --aggregate <Aggregate> [--plural <Plural>]]
```

It copies `templates/app`, generates the backend, takes dev ports no registered app and no process uses (CLA-0082), installs the design system (CLA-0055), writes `frontend/src/shared/api/schema.d.ts` (CLA-0046), writes the lockfiles and makes the first commit on `main`.

It stops before writing anything if `@claudalisk/scripts` at the template's version is not on npm. The owner approves the staged package on npmjs.com.

It also stops before writing anything if git has no identity for the first commit. Ask the owner which name and email to commit with, and add `--git-name <name> --git-email <email>`. They are set only in the new repository.

## 3. Check it

From the new app's root:

```
dotnet test --solution backend/<Root>.slnx
npm ci --ignore-scripts
```

In `frontend`:

```
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run e2e
```

Fix a failure before going on. A failure here is a bug in the template, so file an issue on claudalisk for it (CLA-0022).

## 4. Publish it, with the owner's approval

Show the plan first. It changes nothing:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/new-app.mjs" finish <folder> --dry-run
```

It lists creating the private repository and pushing `main`, the labels `epic` and `needs-design-review` (CLA-0087), registering the app in `~/.claudalisk/apps.json` (CLA-0082) and enrolling it with the runners (CLA-0086).

Ask the owner before running it for real, and name the repository. Then:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/new-app.mjs" finish <folder>
```

The guardrail asks again before the enrolment (CLA-0083). It stops at the first step that fails. Enrolment changes who can use the owner's runners, so add `--no-enrol` if the owner wants to approve that on its own, and run `node "${CLAUDE_PLUGIN_ROOT}/tools/runners.mjs" enroll <folder>` afterwards.

Enrolment needs a registered runner stack for the owner, and `finish` refuses before changing anything if there is none. If a stack is running but not registered, run `node "${CLAUDE_PLUGIN_ROOT}/tools/runners.mjs" adopt <its config folder>`. If there is no stack, use the `runners` skill. Until the repository is enrolled, its CI jobs queue without running.

## 5. Tell the owner what is left

- Fill in the "Domain" section of `AGENTS.md` (CLA-0028).
- Run `node scripts/init.mjs --environment uat` themselves once, when they want uat (CLA-0029, CLA-0066).
- Turn on Dependabot alerts and security updates in the repository settings (CLA-0072).
- Check that the first CI run on a branch passes.
- Use the `proxy` skill if no shared proxy runs on this machine (CLA-0033). Never bring it up or recreate it without the owner.
