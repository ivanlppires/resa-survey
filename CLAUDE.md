# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline-first survey PWA for the RESA research project (UNEMAT): field interviewers collect a 68-question survey (sections: socioeconomic, behavioral, environmental) in rural settlements without internet, and data syncs to a server when connectivity returns. Docs, UI copy, and question content are in Brazilian Portuguese.

## Commands

Run everything from this directory (the repo root). Requires Node >= 20 and PostgreSQL 14+.

```bash
npm run dev      # all workspaces in watch mode (web on :5173, server on :3000)
npm run build    # production build of all workspaces (turbo, respects dependency order)
npm run test     # vitest in @resa/server and @resa/web (pure logic: sync contract, CSV, progress)
npm run clean    # remove dist/ everywhere
```

To run a single workspace's tests: `npm run test -w @resa/server` (or `-w @resa/web`). `npm run lint` exists at the root but no workspace implements it — there is no linter configured.

Server/database commands (need `apps/server/.env` with `DATABASE_URL`; `JWT_SECRET` is **required in production** — the server refuses to boot without it when `NODE_ENV=production`; see `.env.example`):

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

Surveys are created and answered entirely against IndexedDB, keyed by a client-generated `localId` (UUID). Sync is **idempotent**: the `localId` is stored server-side as `surveys.client_id` (UNIQUE), so retries never duplicate. `syncCompletedSurveys()` posts all `completed` surveys in one batch to `POST /api/sync` and flips to `synced` **only** the `localId`s the server confirms in `syncedLocalIds` — never mark surveys synced without server confirmation. It is single-flight guarded and auto-triggered on app open and on the `online` event (see `SurveyListPage`). `cleanupStaleSurveys()` touches **only** `synced` surveys (orphaned or older than 7 days) — unsynced field data must never be auto-deleted. Survey status progresses `draft → in_progress → completed → synced`. "Outro (especifique)" free text lives in a separate `textValue` field (Dexie → payload → `responses.text_value`), never encoded into `value`.

Auth state (JWT + user) is in `localStorage` (`resa_token`, `resa_user`). Roles are `admin | interviewer | viewer`; routing in `App.tsx` sends admins to `/admin` (dashboard) and interviewers to the survey list.

## Conventions and gotchas

- Everything is ESM (`"type": "module"`). Server and shared use `.js` extensions on relative imports in `.ts` files.
- The compiled server loads `dotenv/config`, which resolves `.env` from the **cwd** — run `node dist/index.js` from `apps/server/` (running from the repo root silently misses `apps/server/.env` and the health check reports `db: disconnected`).
- Local dev Postgres lives in the `eleicoes_postgres` Docker container (port **5433**, not 5432) — role `resa`, database `resa_survey`.
- Schema changes touch three places that must stay aligned: Drizzle schema (`apps/server/src/db/schema.ts`), shared types (`packages/shared/src`), and the Dexie schema/types (`apps/web/src/lib/db.ts` — bump the Dexie version when changing indexes).
- Design and implementation plan documents live in `docs/plans/`, including the deploy runbook (`2026-07-29-resa-survey-deploy-coolify-laegc.md` — Coolify + Docker on the LAEGC server; the older PM2 + Nginx runbook is marked obsolete).
- Production is `https://resa-survey.laegc.com.br`, running on Coolify at `179.197.236.155` from the root `docker-compose.yml` (app + Postgres 16). Deploy = push to `master` + trigger the Coolify deploy endpoint; migrations and a conditional seed run at container boot via `docker-entrypoint.sh`.
