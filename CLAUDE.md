# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline-first survey PWA for the RESA research project (UNEMAT): field interviewers collect a 68-question survey (sections: socioeconomic, behavioral, environmental) in rural settlements without internet, and data syncs to a server when connectivity returns. Docs, UI copy, and question content are in Brazilian Portuguese.

## Commands

Run everything from this directory (the repo root). Requires Node >= 20 and PostgreSQL 14+.

```bash
npm run dev      # all workspaces in watch mode (web on :5173, server on :3000)
npm run build    # production build of all workspaces (turbo, respects dependency order)
npm run clean    # remove dist/ everywhere
```

`npm run lint` and `npm run test` exist at the root but no workspace implements them yet — there is no linter or test runner configured.

Server/database commands (need `apps/server/.env` with `DATABASE_URL`, see `.env.example`):

```bash
npm run db:seed -w @resa/server      # insert the 68 questions + initial users
npm run db:generate -w @resa/server  # generate a Drizzle migration from schema changes
npm run db:push -w @resa/server      # push schema directly to the database
npm run db:studio -w @resa/server    # Drizzle Studio
```

## Architecture

npm workspaces + Turborepo monorepo with three packages:

- `packages/shared` (`@resa/shared`) — pure TypeScript types shared by both apps: question/survey/response shapes and the sync payload contract (`SyncPayload`, `SyncResult`). It is consumed via its **built `dist/`**, so after editing it you must rebuild it (or have `npm run dev` running, which runs `tsc --watch`) before the other packages see the change.
- `apps/server` (`@resa/server`) — Fastify 5 API. Routes self-prefix with `/api` (no Fastify prefix option). The auth plugin decorates `app.authenticate` and `app.requireAdmin` (JWT via `@fastify/jwt`); admin-only endpoints live under `/api/admin/*`. Request validation is Zod — throw-on-parse, converted to a 400 by the global error handler in `src/index.ts`. Persistence is Drizzle ORM + postgres-js; schema in `src/db/schema.ts`, migrations in `drizzle/`.
- `apps/web` (`@resa/web`) — React 19 + Vite + Tailwind 4 PWA (`vite-plugin-pwa`, autoUpdate service worker). Vite dev server proxies `/api` → `localhost:3000`; production relies on Nginx doing the same, so the frontend only ever calls relative `/api` paths (`src/lib/api.ts`).

### Offline-first data flow (the core design)

Questions are **data, not code**: they live in Postgres (seeded from `apps/server/src/db/seed.ts`, which is the source of truth for question content — `questionario.txt` at the root is the original text), are served by `GET /api/questions`, and cached in IndexedDB via Dexie (`apps/web/src/lib/db.ts`). Conditional questions use `conditional: { dependsOn, showWhen }` evaluated client-side.

Surveys are created and answered entirely against IndexedDB, keyed by a client-generated `localId` (server IDs don't exist until sync). `apps/web/src/lib/sync.ts` handles the lifecycle: `syncCompletedSurveys()` posts each `completed` survey to `POST /api/sync`, then flips it to `synced` locally; failures are silently retried on the next cycle. `cleanupStaleSurveys()` deletes local surveys whose settlement was removed server-side and synced surveys older than 7 days. Survey status progresses `draft → in_progress → completed → synced`.

Auth state (JWT + user) is in `localStorage` (`resa_token`, `resa_user`). Roles are `admin | interviewer | viewer`; routing in `App.tsx` sends admins to `/admin` (dashboard) and interviewers to the survey list.

## Conventions and gotchas

- Everything is ESM (`"type": "module"`). Server and shared use NodeNext resolution: relative imports in `.ts` files must use the `.js` extension.
- Schema changes touch three places that must stay aligned: Drizzle schema (`apps/server/src/db/schema.ts`), shared types (`packages/shared/src`), and the Dexie schema/types (`apps/web/src/lib/db.ts` — bump the Dexie version when changing indexes).
- Design and implementation plan documents live in `docs/plans/`, including the deploy runbook (`2026-03-07-resa-survey-plan-deploy.md` — PM2 + Nginx on a VPS).
