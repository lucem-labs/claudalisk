# <AppName>

Generic rules live in the claudalisk plugin's ADRs. This file holds only what is specific to this app, and it wins where the two differ (CLA-0028).

## Domain

Describe what this app is for and who uses it.

## Commands

- Backend: `dotnet test --solution backend/<Root>.slnx`
- Frontend: run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` in `frontend`
- End to end: `npm run e2e` in `frontend`
- API types, after a backend change: `npm run api:types` in `frontend`
- Deploy dev: `node scripts/deploy.mjs --environment dev`

## URLs and ports

- dev: `http://<AppName>.dev.localhost`
- uat: `http://<AppName>.uat.localhost`
- The dev database and the local API ports are in `.claude/claudalisk.json`.

## uat data

uat holds real data that cannot be recreated. Only the guarded review deploy changes it (CLA-0029, CLA-0030).

## Deviations

None yet. List each one by ADR id, with the reason.
