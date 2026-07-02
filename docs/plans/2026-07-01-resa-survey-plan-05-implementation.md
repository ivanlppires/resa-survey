# RESA Survey — Plan 05 Implementation Plan (Fixes & Improvements)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all known data-integrity/offline/UX bugs in the RESA Survey app and add CSV export, admin response viewer, auto-sync, and read-only mode for synced surveys, per spec `docs/plans/2026-07-01-resa-survey-plan-05-fixes-and-improvements.md`.

**Architecture:** Client-generated `localId` becomes the sync idempotency key (`client_id` UNIQUE column server-side, per-survey transaction, per-`localId` result reporting). "Outro" free text moves from `"value:text"` string encoding to a separate `textValue` field end-to-end (Dexie → payload → `responses.text_value`). Settlements get mirrored into Dexie for offline use. Pure logic (progress, payload building, sync-outcome resolution, CSV building) is extracted into testable modules with Vitest.

**Tech Stack:** Existing stack only (React 19/Vite/Tailwind 4/Dexie/framer-motion; Fastify 5/Drizzle/postgres-js/zod) + **vitest** (devDependency, new).

## Global Constraints

- Server & shared are ESM/NodeNext: relative imports in `.ts` **must** end in `.js`.
- All UI copy in pt-BR; styling uses existing `apple-*` Tailwind tokens and existing component idioms (bottom sheets, glass headers, framer-motion).
- Migrations are **additive only** (production DB may hold real data). New columns nullable; `UNIQUE(client_id)` relies on Postgres treating NULLs as distinct.
- Legacy clients (old PWA build in the field) must keep working: server accepts payloads **without** `localId`/`textValue`.
- No new runtime dependencies. Only new devDependency: `vitest`.
- Node >= 20. Run all commands from repo root `resa-survey/`.
- Commit after every task; messages in the existing `feat:`/`fix:`/`docs:` style ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Shared sync contract types

**Files:**
- Modify: `packages/shared/src/sync-types.ts` (full replacement)

**Interfaces:**
- Produces: `SyncSurveyMetadata`, `SyncResponseItem`, `SyncSurvey`, `SyncPayload`, `SyncErrorItem`, `SyncResult` — consumed by web `sync-helpers.ts`/`sync.ts` (Tasks 10–11) and mirrored by the server zod schema (Task 3).

- [ ] **Step 1: Replace the file content**

```ts
// packages/shared/src/sync-types.ts
import type { SurveyStatus } from './survey-schema.js'

export interface SyncSurveyMetadata {
  localId: string
  settlementId: number
  lotNumber: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: SurveyStatus
  deviceInfo: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface SyncResponseItem {
  questionKey: string
  value: unknown
  textValue: string | null
  answeredAt: string
}

export interface SyncSurvey {
  metadata: SyncSurveyMetadata
  responses: SyncResponseItem[]
}

export interface SyncPayload {
  surveys: SyncSurvey[]
  deviceInfo: string
  syncedAt: string
}

export interface SyncErrorItem {
  localId: string
  message: string
}

export interface SyncResult {
  syncedLocalIds: string[]
  errors: SyncErrorItem[]
  message?: string
}
```

- [ ] **Step 2: Build shared and confirm nothing else referenced the removed types**

Run: `npm run build -w @resa/shared && grep -rn "SyncError\b\|syncedIds" apps --include=*.ts --include=*.tsx | grep -v dist | grep -v node_modules`
Expected: shared builds; grep hits only in `apps/web/src/lib/sync.ts` and `apps/server/src/routes/surveys.ts` (both rewritten in later tasks).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/sync-types.ts
git commit -m "feat(shared): sync contract keyed by localId with separate textValue"
```

---

### Task 2: Server schema — `surveys.client_id` + `responses.text_value`

**Files:**
- Modify: `apps/server/src/db/schema.ts` (two column additions)
- Create (generated): `apps/server/drizzle/0002_*.sql`

**Interfaces:**
- Produces: `surveys.clientId` (`text`, UNIQUE, nullable), `responses.textValue` (`text`, nullable) — consumed by Tasks 4 and 7.

- [ ] **Step 1: Add `clientId` to the `surveys` table**

In `apps/server/src/db/schema.ts`, inside `export const surveys = pgTable('surveys', {`, add after `id`:

```ts
  clientId: text('client_id').unique(),
```

- [ ] **Step 2: Add `textValue` to the `responses` table**

Inside `export const responses = pgTable('responses', {`, add after `value`:

```ts
  textValue: text('text_value'),
```

- [ ] **Step 3: Generate the migration and inspect it**

Run: `npm run db:generate -w @resa/server`
Expected: new file `apps/server/drizzle/0002_*.sql` containing `ALTER TABLE "surveys" ADD COLUMN "client_id" text;`, `ALTER TABLE "responses" ADD COLUMN "text_value" text;` and a `UNIQUE` constraint on `surveys.client_id` (name `surveys_client_id_unique`).

- [ ] **Step 4: Build server**

Run: `npm run build -w @resa/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle
git commit -m "feat(server): additive columns surveys.client_id (unique) and responses.text_value"
```

---

### Task 3: Server test infra + sync zod schema (TDD)

**Files:**
- Create: `apps/server/src/routes/sync-schema.ts`
- Test: `apps/server/src/routes/sync-schema.test.ts`
- Modify: `apps/server/package.json` (vitest + test script), `apps/server/tsconfig.json` (exclude tests from emit)

**Interfaces:**
- Produces: `syncPayloadSchema` (zod) and `SyncPayloadInput` type — consumed by Task 4.

- [ ] **Step 1: Add vitest to the server workspace**

Run: `npm install -D vitest -w @resa/server`
In `apps/server/package.json` scripts add: `"test": "vitest run"`.
In `apps/server/tsconfig.json` add (top level): `"exclude": ["src/**/*.test.ts"]`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/src/routes/sync-schema.test.ts
import { describe, it, expect } from 'vitest'
import { syncPayloadSchema } from './sync-schema.js'

const base = {
  deviceInfo: 'test-device',
  syncedAt: '2026-07-01T12:00:00.000Z',
}

const metadata = {
  localId: 'uuid-1',
  settlementId: 1,
  lotNumber: '42',
  gpsLat: -15.5,
  gpsLng: -56.1,
  status: 'completed',
  deviceInfo: 'test-device',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T11:00:00.000Z',
  completedAt: '2026-07-01T11:00:00.000Z',
}

describe('syncPayloadSchema', () => {
  it('accepts the new contract with localId and textValue', () => {
    const parsed = syncPayloadSchema.parse({
      ...base,
      surveys: [{
        metadata,
        responses: [{ questionKey: 'q66_problemas_ambientais', value: ['outros'], textValue: 'voçoroca', answeredAt: '2026-07-01T10:30:00.000Z' }],
      }],
    })
    expect(parsed.surveys[0].metadata.localId).toBe('uuid-1')
    expect(parsed.surveys[0].responses[0].textValue).toBe('voçoroca')
  })

  it('accepts legacy payloads without localId and textValue', () => {
    const { localId: _omit, ...legacyMeta } = metadata
    const parsed = syncPayloadSchema.parse({
      ...base,
      surveys: [{
        metadata: legacyMeta,
        responses: [{ questionKey: 'q01_idade', value: '21_30', answeredAt: '2026-07-01T10:05:00.000Z' }],
      }],
    })
    expect(parsed.surveys[0].metadata.localId).toBeUndefined()
    expect(parsed.surveys[0].responses[0].textValue).toBeUndefined()
  })

  it('rejects a survey without settlementId', () => {
    const { settlementId: _omit, ...noSettlement } = metadata
    expect(() => syncPayloadSchema.parse({ ...base, surveys: [{ metadata: noSettlement, responses: [] }] })).toThrow()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -w @resa/server`
Expected: FAIL — cannot resolve `./sync-schema.js`.

- [ ] **Step 4: Implement the schema module**

```ts
// apps/server/src/routes/sync-schema.ts
import { z } from 'zod'

export const syncPayloadSchema = z.object({
  surveys: z.array(z.object({
    metadata: z.object({
      localId: z.string().min(1).optional(),
      settlementId: z.number(),
      lotNumber: z.string().nullable().optional(),
      gpsLat: z.number().nullable().optional(),
      gpsLng: z.number().nullable().optional(),
      status: z.enum(['draft', 'in_progress', 'completed', 'synced']),
      deviceInfo: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
      completedAt: z.string().nullable().optional(),
    }),
    responses: z.array(z.object({
      questionKey: z.string(),
      value: z.any(),
      textValue: z.string().nullable().optional(),
      answeredAt: z.string(),
    })),
  })),
  deviceInfo: z.string(),
  syncedAt: z.string(),
})

export type SyncPayloadInput = z.infer<typeof syncPayloadSchema>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w @resa/server`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/src/routes/sync-schema.ts apps/server/src/routes/sync-schema.test.ts package-lock.json
git commit -m "feat(server): vitest infra + sync payload schema with localId/textValue (legacy-compatible)"
```

---

### Task 4: Rewrite `POST /api/sync` — idempotent by `client_id`, per-survey transaction, per-localId results

**Files:**
- Modify: `apps/server/src/routes/surveys.ts` (replace the `/api/sync` handler and the old inline schema)

**Interfaces:**
- Consumes: `syncPayloadSchema` (Task 3), `surveys.clientId`/`responses.textValue` (Task 2).
- Produces: response body `{ syncedLocalIds: string[], errors: { localId: string, message: string }[] }` (HTTP 201) — consumed by web Task 10/11.

- [ ] **Step 1: Replace imports and delete the old inline `syncPayloadSchema`**

At the top of `apps/server/src/routes/surveys.ts`: remove the whole `const syncPayloadSchema = z.object({ ... })` block and the `import crypto from 'node:crypto'` stays. Add:

```ts
import { syncPayloadSchema } from './sync-schema.js'
```

- [ ] **Step 2: Replace the entire `app.post('/api/sync', ...)` handler with:**

```ts
  app.post('/api/sync', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = syncPayloadSchema.parse(request.body)
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(body.surveys)).digest('hex')
    const syncedLocalIds: string[] = []
    const errors: { localId: string; message: string }[] = []

    const isClientIdConflict = (e: unknown): boolean => {
      if (typeof e !== 'object' || e === null) return false
      const pg = e as { code?: string; constraint_name?: string; message?: string }
      return pg.code === '23505' && `${pg.constraint_name ?? ''} ${pg.message ?? ''}`.includes('client_id')
    }

    for (let i = 0; i < body.surveys.length; i++) {
      const item = body.surveys[i]
      const localId = item.metadata.localId ?? null
      try {
        if (localId) {
          const [existing] = await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.clientId, localId))
          if (existing) {
            syncedLocalIds.push(localId)
            continue
          }
        }
        await db.transaction(async (tx) => {
          const [created] = await tx.insert(surveys).values({
            clientId: localId,
            settlementId: item.metadata.settlementId,
            interviewerId: request.user.id,
            lotNumber: item.metadata.lotNumber ?? null,
            gpsLat: item.metadata.gpsLat ?? null,
            gpsLng: item.metadata.gpsLng ?? null,
            status: 'synced',
            deviceInfo: item.metadata.deviceInfo ?? null,
            createdAt: new Date(item.metadata.createdAt),
            updatedAt: new Date(item.metadata.updatedAt),
            completedAt: item.metadata.completedAt ? new Date(item.metadata.completedAt) : null,
            syncedAt: new Date(),
          }).returning({ id: surveys.id })

          if (item.responses.length > 0) {
            await tx.insert(responses).values(
              item.responses.map((r) => ({
                surveyId: created.id,
                questionKey: r.questionKey,
                value: r.value,
                textValue: r.textValue ?? null,
                answeredAt: new Date(r.answeredAt),
              }))
            )
          }

          await tx.insert(syncLog).values({
            surveyId: created.id,
            deviceInfo: body.deviceInfo,
            payloadHash,
          })
        })
        if (localId) syncedLocalIds.push(localId)
      } catch (err) {
        if (localId && isClientIdConflict(err)) {
          syncedLocalIds.push(localId)
        } else {
          errors.push({
            localId: localId ?? `sem-localId-${i}`,
            message: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    }

    return reply.status(201).send({ syncedLocalIds, errors })
  })
```

- [ ] **Step 3: Build server**

Run: `npm run build -w @resa/server`
Expected: PASS (no unused-import errors; `z` is still used by the other route schemas in this file).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/surveys.ts
git commit -m "fix(server): idempotent sync keyed by client_id with per-survey transactions and per-localId results"
```

---

### Task 5: Server hardening — JWT secret fail-fast, authenticated settlement detail, `.env.example`

**Files:**
- Modify: `apps/server/src/plugins/auth.ts`, `apps/server/src/routes/settlements.ts`, `apps/server/.env.example`

- [ ] **Step 1: Enforce JWT_SECRET in production**

In `apps/server/src/plugins/auth.ts`, replace the `app.register(fjwt, ...)` call with:

```ts
  const secret = process.env.JWT_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET é obrigatório em produção — defina em apps/server/.env')
    }
    app.log.warn('JWT_SECRET não definido — usando secret de desenvolvimento inseguro')
  }
  await app.register(fjwt, {
    secret: secret || 'dev-secret-change-in-production',
  })
```

- [ ] **Step 2: Require auth on `GET /api/settlements/:id`**

In `apps/server/src/routes/settlements.ts`, change:

```ts
  app.get<{ Params: { id: string } }>('/api/settlements/:id', async (request, reply) => {
```

to:

```ts
  app.get<{ Params: { id: string } }>('/api/settlements/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
```

- [ ] **Step 3: Complete `.env.example`**

Replace `apps/server/.env.example` content with:

```
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://resa:PASSWORD@localhost:5432/resa_survey
JWT_SECRET=troque-por-um-secret-longo-e-aleatorio
NODE_ENV=development
```

- [ ] **Step 4: Build + commit**

Run: `npm run build -w @resa/server` — expected PASS.

```bash
git add apps/server/src/plugins/auth.ts apps/server/src/routes/settlements.ts apps/server/.env.example
git commit -m "fix(server): fail fast without JWT_SECRET in production; authenticate settlement detail"
```

---

### Task 6: CSV builder (TDD)

**Files:**
- Create: `apps/server/src/lib/csv.ts`
- Test: `apps/server/src/lib/csv.test.ts`

**Interfaces:**
- Produces: `buildCsv(questions: CsvQuestion[], rows: CsvSurveyRow[]): string`, `csvEscape`, `formatValue`, types `CsvQuestion { key, sortOrder, hasTextOption }`, `CsvSurveyRow` — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/lib/csv.test.ts
import { describe, it, expect } from 'vitest'
import { buildCsv, csvEscape, formatValue, type CsvQuestion, type CsvSurveyRow } from './csv.js'

const questions: CsvQuestion[] = [
  { key: 'q02_escolaridade', sortOrder: 2, hasTextOption: false },
  { key: 'q01_idade', sortOrder: 1, hasTextOption: false },
  { key: 'q66_problemas', sortOrder: 68, hasTextOption: true },
]

function row(overrides: Partial<CsvSurveyRow> = {}): CsvSurveyRow {
  return {
    id: 7,
    clientId: 'uuid-7',
    settlementName: 'PA Nova Esperança',
    municipality: 'Cáceres',
    biome: 'Pantanal',
    interviewerName: 'Maria',
    interviewerEmail: 'maria@resa.br',
    lotNumber: '42',
    gpsLat: -16.07,
    gpsLng: -57.68,
    createdAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T11:00:00.000Z',
    syncedAt: '2026-07-01T12:00:00.000Z',
    responses: new Map([
      ['q01_idade', { value: '21_30', textValue: null }],
      ['q66_problemas', { value: ['erosao', 'outros'], textValue: 'voçoroca' }],
    ]),
    ...overrides,
  }
}

describe('csvEscape', () => {
  it('quotes fields containing the delimiter and doubles inner quotes', () => {
    expect(csvEscape('a;b')).toBe('"a;b"')
    expect(csvEscape('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvEscape('simples')).toBe('simples')
  })
})

describe('formatValue', () => {
  it('joins arrays with ; and stringifies scalars', () => {
    expect(formatValue(['a', 'b'])).toBe('a; b')
    expect(formatValue(4)).toBe('4')
    expect(formatValue(null)).toBe('')
  })
})

describe('buildCsv', () => {
  it('starts with BOM, orders question columns by sortOrder, adds _texto column and escapes multi-choice', () => {
    const csv = buildCsv(questions, [row()])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n')
    const header = lines[0].split(';')
    expect(header.slice(13)).toEqual(['q01_idade', 'q02_escolaridade', 'q66_problemas', 'q66_problemas_texto'])
    expect(lines[1]).toContain('"erosao; outros"')
    expect(lines[1]).toContain('voçoroca')
    expect(lines[1].split(';')[0]).toBe('7')
  })

  it('emits empty cells for unanswered questions and null metadata', () => {
    const csv = buildCsv(questions, [row({ responses: new Map(), lotNumber: null, completedAt: null })])
    const line = csv.replace('﻿', '').trimEnd().split('\r\n')[1]
    const cells = line.split(';')
    expect(cells[7]).toBe('')          // lote
    expect(cells[13]).toBe('')         // q01_idade
    expect(cells[16]).toBe('')         // q66_problemas_texto
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @resa/server`
Expected: FAIL — cannot resolve `./csv.js`.

- [ ] **Step 3: Implement**

```ts
// apps/server/src/lib/csv.ts
export interface CsvQuestion {
  key: string
  sortOrder: number
  hasTextOption: boolean
}

export interface CsvSurveyRow {
  id: number
  clientId: string | null
  settlementName: string
  municipality: string
  biome: string
  interviewerName: string
  interviewerEmail: string
  lotNumber: string | null
  gpsLat: number | null
  gpsLng: number | null
  createdAt: string
  completedAt: string | null
  syncedAt: string | null
  responses: Map<string, { value: unknown; textValue: string | null }>
}

const META_HEADERS = [
  'id', 'client_id', 'assentamento', 'municipio', 'bioma',
  'entrevistador', 'email_entrevistador', 'lote', 'gps_lat', 'gps_lng',
  'criado_em', 'concluido_em', 'sincronizado_em',
]

export function csvEscape(field: string): string {
  if (/[";\n\r]/.test(field)) return '"' + field.replace(/"/g, '""') + '"'
  return field
}

export function formatValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(String).join('; ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function buildCsv(questions: CsvQuestion[], rows: CsvSurveyRow[]): string {
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder)
  const header = [...META_HEADERS]
  for (const q of sorted) {
    header.push(q.key)
    if (q.hasTextOption) header.push(`${q.key}_texto`)
  }

  const lines = [header.map(csvEscape).join(';')]
  for (const r of rows) {
    const cells = [
      String(r.id), r.clientId ?? '', r.settlementName, r.municipality, r.biome,
      r.interviewerName, r.interviewerEmail, r.lotNumber ?? '',
      r.gpsLat != null ? String(r.gpsLat) : '', r.gpsLng != null ? String(r.gpsLng) : '',
      r.createdAt, r.completedAt ?? '', r.syncedAt ?? '',
    ]
    for (const q of sorted) {
      const resp = r.responses.get(q.key)
      cells.push(formatValue(resp?.value))
      if (q.hasTextOption) cells.push(resp?.textValue ?? '')
    }
    lines.push(cells.map(csvEscape).join(';'))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @resa/server`
Expected: all pass (sync-schema + csv).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/csv.ts apps/server/src/lib/csv.test.ts
git commit -m "feat(server): pure CSV builder (pt-BR Excel: BOM + semicolon) with tests"
```

---

### Task 7: Export route `GET /api/admin/export.csv`

**Files:**
- Create: `apps/server/src/routes/export.ts`
- Modify: `apps/server/src/index.ts` (register)

**Interfaces:**
- Consumes: `buildCsv` (Task 6), schema columns (Task 2).
- Produces: `GET /api/admin/export.csv?settlementId=` → `text/csv` attachment — consumed by admin UI (Task 16).

- [ ] **Step 1: Implement the route**

```ts
// apps/server/src/routes/export.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { surveys, responses, settlements, users, questions } from '../db/schema.js'
import { buildCsv, type CsvQuestion, type CsvSurveyRow } from '../lib/csv.js'

export async function exportRoutes(app: FastifyInstance) {
  app.get('/api/admin/export.csv', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const query = z.object({ settlementId: z.coerce.number().optional() }).parse(request.query)

    const questionRows = await db.select().from(questions).orderBy(asc(questions.sortOrder))
    const csvQuestions: CsvQuestion[] = questionRows.map((q) => ({
      key: q.key,
      sortOrder: q.sortOrder,
      hasTextOption: (q.options ?? []).some((o) => !!o.hasTextInput),
    }))

    const where = query.settlementId
      ? and(eq(surveys.status, 'synced'), eq(surveys.settlementId, query.settlementId))
      : eq(surveys.status, 'synced')

    const surveyRows = await db.select({
      id: surveys.id,
      clientId: surveys.clientId,
      lotNumber: surveys.lotNumber,
      gpsLat: surveys.gpsLat,
      gpsLng: surveys.gpsLng,
      createdAt: surveys.createdAt,
      completedAt: surveys.completedAt,
      syncedAt: surveys.syncedAt,
      settlementName: settlements.name,
      municipality: settlements.municipality,
      biome: settlements.biome,
      interviewerName: users.name,
      interviewerEmail: users.email,
    }).from(surveys)
      .innerJoin(settlements, eq(surveys.settlementId, settlements.id))
      .innerJoin(users, eq(surveys.interviewerId, users.id))
      .where(where)
      .orderBy(asc(surveys.id))

    const allResponses = surveyRows.length > 0
      ? await db.select().from(responses).where(inArray(responses.surveyId, surveyRows.map((s) => s.id)))
      : []
    const bySurvey = new Map<number, Map<string, { value: unknown; textValue: string | null }>>()
    for (const r of allResponses) {
      let m = bySurvey.get(r.surveyId)
      if (!m) { m = new Map(); bySurvey.set(r.surveyId, m) }
      m.set(r.questionKey, { value: r.value, textValue: r.textValue })
    }

    const rows: CsvSurveyRow[] = surveyRows.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      settlementName: s.settlementName,
      municipality: s.municipality,
      biome: s.biome,
      interviewerName: s.interviewerName,
      interviewerEmail: s.interviewerEmail,
      lotNumber: s.lotNumber,
      gpsLat: s.gpsLat,
      gpsLng: s.gpsLng,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      syncedAt: s.syncedAt?.toISOString() ?? null,
      responses: bySurvey.get(s.id) ?? new Map(),
    }))

    const today = new Date().toISOString().slice(0, 10)
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="resa-survey-${today}.csv"`)
    return buildCsv(csvQuestions, rows)
  })
}
```

- [ ] **Step 2: Register in `apps/server/src/index.ts`**

Add import `import { exportRoutes } from './routes/export.js'` and, after `await app.register(surveyRoutes)`:

```ts
await app.register(exportRoutes)
```

- [ ] **Step 3: Build + commit**

Run: `npm run build -w @resa/server` — expected PASS.

```bash
git add apps/server/src/routes/export.ts apps/server/src/index.ts
git commit -m "feat(server): admin CSV export endpoint"
```

---

### Task 8: Web foundation — Dexie v2 (settlements store, textValue) + `ApiError`

**Files:**
- Modify: `apps/web/src/lib/db.ts`, `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `LocalSettlement { id, name, municipality, biome }`, `db.settlements`, `LocalResponse.textValue?: string`, `class ApiError extends Error { status: number }` — consumed by Tasks 10–16.

- [ ] **Step 1: Update `db.ts`**

Add interface + `textValue` and bump schema:

```ts
export interface LocalSettlement {
  id: number
  name: string
  municipality: string
  biome: string
}
```

In `LocalResponse`, after `value: unknown`, add:

```ts
  textValue?: string
```

Change the Dexie cast to include the new table:

```ts
const db = new Dexie('resa-survey') as Dexie & {
  questions: EntityTable<LocalQuestion, 'id'>
  surveys: EntityTable<LocalSurvey, 'id'>
  responses: EntityTable<LocalResponse, 'id'>
  settlements: EntityTable<LocalSettlement, 'id'>
}
```

After the existing `db.version(1).stores({...})` add:

```ts
db.version(2).stores({
  settlements: 'id',
})
```

- [ ] **Step 2: Add `ApiError` in `api.ts`**

At the top of `apps/web/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
```

Replace the `if (!res.ok) { ... }` block in `apiFetch` with:

```ts
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `API error ${res.status}`, res.status)
  }
```

- [ ] **Step 3: Build + commit**

Run: `npm run build -w @resa/web` — expected PASS.

```bash
git add apps/web/src/lib/db.ts apps/web/src/lib/api.ts
git commit -m "feat(web): Dexie v2 with settlements cache and response textValue; typed ApiError"
```

---

### Task 9: Web test infra + progress module (TDD)

**Files:**
- Create: `apps/web/src/lib/progress.ts`
- Test: `apps/web/src/lib/progress.test.ts`
- Modify: `apps/web/package.json` (vitest + test script)

**Interfaces:**
- Produces: `ProgressQuestion { key, section, conditional }`, `isConditionMet`, `isAnswered(value): boolean`, `applicableQuestions`, `computeProgress(questions, responses): number` (0–100), `unansweredBySection(questions, responses): Record<Section, number>` — consumed by Task 12. `LocalQuestion` is structurally assignable to `ProgressQuestion`.

- [ ] **Step 1: Add vitest to the web workspace**

Run: `npm install -D vitest -w @resa/web`
In `apps/web/package.json` scripts add: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/src/lib/progress.test.ts
import { describe, it, expect } from 'vitest'
import { computeProgress, isAnswered, isConditionMet, unansweredBySection, type ProgressQuestion } from './progress'

const q = (key: string, section: ProgressQuestion['section'], conditional: ProgressQuestion['conditional'] = null): ProgressQuestion =>
  ({ key, section, conditional })

const questions: ProgressQuestion[] = [
  q('q1', 'socioeconomic'),
  q('q2', 'socioeconomic', { dependsOn: 'q1', showWhen: ['sim'] }),
  q('q3', 'behavioral'),
  q('q4', 'environmental'),
]

describe('isAnswered', () => {
  it('treats empty string, empty array and undefined as unanswered', () => {
    expect(isAnswered(undefined)).toBe(false)
    expect(isAnswered('   ')).toBe(false)
    expect(isAnswered([])).toBe(false)
    expect(isAnswered('x')).toBe(true)
    expect(isAnswered(['a'])).toBe(true)
    expect(isAnswered(0)).toBe(true)
  })
})

describe('isConditionMet', () => {
  it('matches string parents and array parents', () => {
    const cond = q('c', 'socioeconomic', { dependsOn: 'p', showWhen: ['sim'] })
    expect(isConditionMet(cond, new Map([['p', 'sim']]))).toBe(true)
    expect(isConditionMet(cond, new Map([['p', 'nao']]))).toBe(false)
    expect(isConditionMet(cond, new Map([['p', ['sim', 'outro']]]))).toBe(true)
    expect(isConditionMet(cond, new Map())).toBe(false)
  })
})

describe('computeProgress', () => {
  it('excludes hidden conditionals from the denominator', () => {
    // q2 hidden (q1 = 'nao') → 3 applicable, 1 answered
    expect(computeProgress(questions, new Map([['q1', 'nao']]))).toBe(33)
  })

  it('includes visible conditionals and never exceeds 100', () => {
    const responses = new Map<string, unknown>([
      ['q1', 'sim'], ['q2', 'x'], ['q3', ['a']], ['q4', 5],
    ])
    expect(computeProgress(questions, responses)).toBe(100)
  })

  it('returns 0 with no questions', () => {
    expect(computeProgress([], new Map())).toBe(0)
  })
})

describe('unansweredBySection', () => {
  it('counts only applicable unanswered questions per section', () => {
    const counts = unansweredBySection(questions, new Map([['q1', 'sim']]))
    expect(counts).toEqual({ socioeconomic: 1, behavioral: 1, environmental: 1 })
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -w @resa/web`
Expected: FAIL — cannot resolve `./progress`.

- [ ] **Step 4: Implement**

```ts
// apps/web/src/lib/progress.ts
export interface ProgressQuestion {
  key: string
  section: 'socioeconomic' | 'behavioral' | 'environmental'
  conditional: { dependsOn: string; showWhen: string[] } | null
}

export function isConditionMet(q: ProgressQuestion, responses: Map<string, unknown>): boolean {
  if (!q.conditional) return true
  const parent = responses.get(q.conditional.dependsOn)
  if (parent == null) return false
  if (Array.isArray(parent)) return parent.some((v) => q.conditional!.showWhen.includes(String(v)))
  return q.conditional.showWhen.includes(String(parent))
}

export function isAnswered(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function applicableQuestions(questions: ProgressQuestion[], responses: Map<string, unknown>): ProgressQuestion[] {
  return questions.filter((q) => isConditionMet(q, responses))
}

export function computeProgress(questions: ProgressQuestion[], responses: Map<string, unknown>): number {
  const applicable = applicableQuestions(questions, responses)
  if (applicable.length === 0) return 0
  const answered = applicable.filter((q) => isAnswered(responses.get(q.key))).length
  return Math.min(100, Math.round((answered / applicable.length) * 100))
}

export function unansweredBySection(
  questions: ProgressQuestion[],
  responses: Map<string, unknown>,
): Record<ProgressQuestion['section'], number> {
  const counts: Record<ProgressQuestion['section'], number> = { socioeconomic: 0, behavioral: 0, environmental: 0 }
  for (const q of applicableQuestions(questions, responses)) {
    if (!isAnswered(responses.get(q.key))) counts[q.section]++
  }
  return counts
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w @resa/web`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/progress.ts apps/web/src/lib/progress.test.ts package-lock.json
git commit -m "feat(web): vitest infra + pure progress/applicability module with tests"
```

---

### Task 10: Sync helpers (TDD)

**Files:**
- Create: `apps/web/src/lib/sync-helpers.ts`
- Test: `apps/web/src/lib/sync-helpers.test.ts`

**Interfaces:**
- Consumes: shared types (Task 1); `import type { LocalSurvey, LocalResponse } from './db'` (type-only — erased at runtime, safe in tests).
- Produces: `buildSyncPayload(pending: LocalSurvey[], responsesByLocalId: Map<string, LocalResponse[]>, deviceInfo: string, syncedAt: string): SyncPayload` and `resolveSyncOutcome(pendingLocalIds: string[], result: SyncResult): { syncedLocalIds: string[]; failedLocalIds: string[] }` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/sync-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { buildSyncPayload, resolveSyncOutcome } from './sync-helpers'
import type { LocalSurvey, LocalResponse } from './db'

const survey: LocalSurvey = {
  id: 1,
  localId: 'uuid-1',
  settlementId: 3,
  settlementName: 'PA Teste',
  lotNumber: '42',
  gpsLat: -16.1,
  gpsLng: -57.7,
  status: 'completed',
  deviceInfo: 'ua',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T11:00:00.000Z',
  completedAt: '2026-07-01T11:00:00.000Z',
  syncedAt: null,
}

const responses: LocalResponse[] = [
  { id: 1, surveyLocalId: 'uuid-1', questionKey: 'q66', value: ['outros'], textValue: 'voçoroca', answeredAt: '2026-07-01T10:30:00.000Z' },
  { id: 2, surveyLocalId: 'uuid-1', questionKey: 'q01', value: '21_30', answeredAt: '2026-07-01T10:05:00.000Z' },
]

describe('buildSyncPayload', () => {
  it('maps localId, settlementId and textValue into the contract', () => {
    const payload = buildSyncPayload([survey], new Map([['uuid-1', responses]]), 'ua', '2026-07-01T12:00:00.000Z')
    expect(payload.surveys).toHaveLength(1)
    expect(payload.surveys[0].metadata.localId).toBe('uuid-1')
    expect(payload.surveys[0].metadata.settlementId).toBe(3)
    expect(payload.surveys[0].responses[0].textValue).toBe('voçoroca')
    expect(payload.surveys[0].responses[1].textValue).toBeNull()
    expect(payload.deviceInfo).toBe('ua')
  })

  it('sends empty responses array when none exist', () => {
    const payload = buildSyncPayload([survey], new Map(), 'ua', '2026-07-01T12:00:00.000Z')
    expect(payload.surveys[0].responses).toEqual([])
  })
})

describe('resolveSyncOutcome', () => {
  it('splits pending ids into confirmed and failed', () => {
    const outcome = resolveSyncOutcome(['a', 'b', 'c'], { syncedLocalIds: ['a', 'c'], errors: [{ localId: 'b', message: 'FK' }] })
    expect(outcome.syncedLocalIds).toEqual(['a', 'c'])
    expect(outcome.failedLocalIds).toEqual(['b'])
  })

  it('treats an empty server response as all-failed (never marks blindly)', () => {
    const outcome = resolveSyncOutcome(['a'], { syncedLocalIds: [], errors: [] })
    expect(outcome.syncedLocalIds).toEqual([])
    expect(outcome.failedLocalIds).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @resa/web`
Expected: FAIL — cannot resolve `./sync-helpers`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/sync-helpers.ts
import type { SyncPayload, SyncResult, SyncSurvey } from '@resa/shared'
import type { LocalSurvey, LocalResponse } from './db'

export function buildSyncPayload(
  pending: LocalSurvey[],
  responsesByLocalId: Map<string, LocalResponse[]>,
  deviceInfo: string,
  syncedAt: string,
): SyncPayload {
  const surveys: SyncSurvey[] = pending.map((s) => ({
    metadata: {
      localId: s.localId,
      settlementId: s.settlementId,
      lotNumber: s.lotNumber || null,
      gpsLat: s.gpsLat,
      gpsLng: s.gpsLng,
      status: s.status,
      deviceInfo: s.deviceInfo || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      completedAt: s.completedAt,
    },
    responses: (responsesByLocalId.get(s.localId) ?? []).map((r) => ({
      questionKey: r.questionKey,
      value: r.value,
      textValue: r.textValue ?? null,
      answeredAt: r.answeredAt,
    })),
  }))
  return { surveys, deviceInfo, syncedAt }
}

export interface SyncOutcome {
  syncedLocalIds: string[]
  failedLocalIds: string[]
}

export function resolveSyncOutcome(pendingLocalIds: string[], result: SyncResult): SyncOutcome {
  const confirmed = new Set(result.syncedLocalIds)
  return {
    syncedLocalIds: pendingLocalIds.filter((id) => confirmed.has(id)),
    failedLocalIds: pendingLocalIds.filter((id) => !confirmed.has(id)),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @resa/web`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sync-helpers.ts apps/web/src/lib/sync-helpers.test.ts
git commit -m "feat(web): pure sync payload/outcome helpers with tests"
```

---

### Task 11: Rewrite `apps/web/src/lib/sync.ts`

**Files:**
- Modify: `apps/web/src/lib/sync.ts` (full replacement)

**Interfaces:**
- Consumes: Tasks 8, 10; shared `SyncResult`.
- Produces (consumed by Tasks 12–14):
  - `syncQuestions(): Promise<void>`, `getQuestions(): Promise<LocalQuestion[]>` (unchanged behavior)
  - `syncSettlements(): Promise<void>`, `getSettlements(): Promise<LocalSettlement[]>`
  - `syncCompletedSurveys(): Promise<SyncStatus>` where `type SyncStatus = { kind: 'nothing-pending' } | { kind: 'auth-expired' } | { kind: 'error' } | { kind: 'done'; syncedCount: number; failedCount: number }` — single-flight guarded
  - `cleanupStaleSurveys(): Promise<number>` (synced-only), `deleteLocalSurvey(localId): Promise<void>`

- [ ] **Step 1: Replace the file content**

```ts
// apps/web/src/lib/sync.ts
import { db, type LocalQuestion, type LocalResponse, type LocalSettlement } from './db'
import { apiFetch, ApiError } from './api'
import { buildSyncPayload, resolveSyncOutcome } from './sync-helpers'
import type { SyncResult } from '@resa/shared'

export async function syncQuestions(): Promise<void> {
  try {
    const questions = await apiFetch<LocalQuestion[]>('/questions')
    await db.questions.clear()
    await db.questions.bulkAdd(questions)
  } catch {
    // Offline — use cached questions
  }
}

export async function getQuestions(): Promise<LocalQuestion[]> {
  let questions = await db.questions.orderBy('sortOrder').toArray()
  if (questions.length === 0) {
    await syncQuestions()
    questions = await db.questions.orderBy('sortOrder').toArray()
  }
  return questions
}

interface ApiSettlement {
  id: number
  name: string
  municipality: string
  biome: string
}

export async function syncSettlements(): Promise<void> {
  try {
    const settlements = await apiFetch<ApiSettlement[]>('/settlements')
    await db.settlements.clear()
    await db.settlements.bulkAdd(
      settlements.map(({ id, name, municipality, biome }) => ({ id, name, municipality, biome }))
    )
  } catch {
    // Offline — use cached settlements
  }
}

export async function getSettlements(): Promise<LocalSettlement[]> {
  await syncSettlements()
  return db.settlements.toArray()
}

/**
 * Remove apenas questionários JÁ SINCRONIZADOS que ficaram órfãos
 * (assentamento removido) ou antigos (> 7 dias). Questionários não
 * sincronizados nunca são apagados automaticamente.
 */
export async function cleanupStaleSurveys(): Promise<number> {
  const validIds = new Set((await db.settlements.toArray()).map((s) => s.id))
  const allSurveys = await db.surveys.toArray()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const toDelete = allSurveys.filter((s) =>
    s.status === 'synced' && (
      (validIds.size > 0 && !validIds.has(s.settlementId)) ||
      (s.syncedAt !== null && s.syncedAt < sevenDaysAgo)
    )
  )

  for (const survey of toDelete) {
    await db.responses.where('surveyLocalId').equals(survey.localId).delete()
    await db.surveys.where('localId').equals(survey.localId).delete()
  }
  return toDelete.length
}

export async function deleteLocalSurvey(localId: string): Promise<void> {
  await db.responses.where('surveyLocalId').equals(localId).delete()
  await db.surveys.where('localId').equals(localId).delete()
}

export type SyncStatus =
  | { kind: 'nothing-pending' }
  | { kind: 'auth-expired' }
  | { kind: 'error' }
  | { kind: 'done'; syncedCount: number; failedCount: number }

let inFlight: Promise<SyncStatus> | null = null

/** Single-flight: chamadas concorrentes compartilham a mesma requisição. */
export function syncCompletedSurveys(): Promise<SyncStatus> {
  if (!inFlight) {
    inFlight = doSync().finally(() => { inFlight = null })
  }
  return inFlight
}

async function doSync(): Promise<SyncStatus> {
  const pending = await db.surveys.where('status').equals('completed').toArray()
  if (pending.length === 0) return { kind: 'nothing-pending' }

  const responsesByLocalId = new Map<string, LocalResponse[]>()
  for (const s of pending) {
    responsesByLocalId.set(s.localId, await db.responses.where('surveyLocalId').equals(s.localId).toArray())
  }

  const payload = buildSyncPayload(pending, responsesByLocalId, navigator.userAgent, new Date().toISOString())

  let result: SyncResult
  try {
    result = await apiFetch<SyncResult>('/sync', { method: 'POST', body: JSON.stringify(payload) })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { kind: 'auth-expired' }
    return { kind: 'error' }
  }

  const outcome = resolveSyncOutcome(pending.map((s) => s.localId), result)
  const now = new Date().toISOString()
  for (const localId of outcome.syncedLocalIds) {
    await db.surveys.where('localId').equals(localId).modify({
      status: 'synced' as const,
      syncedAt: now,
    })
  }
  return { kind: 'done', syncedCount: outcome.syncedLocalIds.length, failedCount: outcome.failedLocalIds.length }
}
```

- [ ] **Step 2: Typecheck (list page still uses the old API — expected to fail there only)**

Run: `npx tsc -b apps/web 2>&1 | head -20`
Expected: errors ONLY in `SurveyListPage.tsx` (old call signature) — fixed in Task 14. If other files error, fix them now.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/sync.ts
git commit -m "fix(web): batched idempotent sync with confirmed-localId marking; settlements cache; cleanup only touches synced surveys"
```

---

### Task 12: SurveyPage — textValue, progress, completion confirmation, read-only

**Files:**
- Modify: `apps/web/src/pages/SurveyPage.tsx` (full replacement)

**Interfaces:**
- Consumes: `computeProgress`, `unansweredBySection`, `isConditionMet` (Task 9); `db` with `textValue` (Task 8); `getQuestions` (Task 11).
- Produces: route behavior — synced surveys render read-only (no finalize button, inputs disabled).

- [ ] **Step 1: Replace the file content**

```tsx
// apps/web/src/pages/SurveyPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { db, type LocalQuestion, type LocalSurvey } from '../lib/db'
import { getQuestions } from '../lib/sync'
import { computeProgress, isConditionMet, unansweredBySection } from '../lib/progress'

const sectionLabels = {
  socioeconomic: 'Socioec.',
  behavioral: 'Comport.',
  environmental: 'Ambiental',
} as const

const sectionFullLabels = {
  socioeconomic: 'Socioeconômico',
  behavioral: 'Comportamental',
  environmental: 'Ambiental',
} as const

type Section = keyof typeof sectionLabels

export default function SurveyPage() {
  const { localId } = useParams<{ localId: string }>()
  const navigate = useNavigate()
  const [survey, setSurvey] = useState<LocalSurvey | null>(null)
  const [questions, setQuestions] = useState<LocalQuestion[]>([])
  const [responses, setResponses] = useState<Map<string, unknown>>(new Map())
  const [textValues, setTextValues] = useState<Map<string, string>>(new Map())
  const [currentSection, setCurrentSection] = useState<Section>('socioeconomic')
  const [loading, setLoading] = useState(true)
  const [showConfirmFinish, setShowConfirmFinish] = useState(false)

  const sections: Section[] = ['socioeconomic', 'behavioral', 'environmental']
  const readOnly = survey?.status === 'synced'

  useEffect(() => {
    async function load() {
      const s = await db.surveys.where('localId').equals(localId!).first()
      setSurvey(s ?? null)
      const qs = await getQuestions()
      setQuestions(qs)
      const existing = await db.responses.where('surveyLocalId').equals(localId!).toArray()
      const values = new Map<string, unknown>()
      const texts = new Map<string, string>()
      existing.forEach((r) => {
        values.set(r.questionKey, r.value)
        if (r.textValue) texts.set(r.questionKey, r.textValue)
      })
      setResponses(values)
      setTextValues(texts)
      setLoading(false)
    }
    load()
  }, [localId])

  const saveResponse = useCallback(async (questionKey: string, value: unknown, textValue?: string) => {
    if (readOnly) return

    setResponses((prev) => new Map(prev).set(questionKey, value))
    setTextValues((prev) => {
      const next = new Map(prev)
      if (textValue !== undefined && textValue !== '') next.set(questionKey, textValue)
      else next.delete(questionKey)
      return next
    })

    const existing = await db.responses
      .where('[surveyLocalId+questionKey]')
      .equals([localId!, questionKey])
      .first()

    const now = new Date().toISOString()
    const storedText = textValue !== undefined && textValue !== '' ? textValue : undefined
    if (existing) {
      await db.responses.update(existing.id!, { value, textValue: storedText, answeredAt: now })
    } else {
      await db.responses.add({ surveyLocalId: localId!, questionKey, value, textValue: storedText, answeredAt: now })
    }
    await db.surveys.where('localId').equals(localId!).modify({ updatedAt: now })

    // Respostas de condicionais que ficaram ocultas são descartadas
    const nextValues = new Map(responses).set(questionKey, value)
    for (const child of questions) {
      if (child.conditional?.dependsOn !== questionKey) continue
      if (isConditionMet(child, nextValues)) continue
      if (!nextValues.has(child.key)) continue
      await db.responses.where('[surveyLocalId+questionKey]').equals([localId!, child.key]).delete()
      setResponses((prev) => {
        const next = new Map(prev)
        next.delete(child.key)
        return next
      })
      setTextValues((prev) => {
        const next = new Map(prev)
        next.delete(child.key)
        return next
      })
    }
  }, [localId, readOnly, responses, questions])

  const completeSurvey = async () => {
    const now = new Date().toISOString()
    await db.surveys.where('localId').equals(localId!).modify({
      status: 'completed' as const,
      completedAt: now,
      updatedAt: now,
    })
    navigate('/')
  }

  const handleFinishClick = () => {
    const counts = unansweredBySection(questions, responses)
    const total = counts.socioeconomic + counts.behavioral + counts.environmental
    if (total > 0) setShowConfirmFinish(true)
    else completeSurvey()
  }

  const sectionQuestions = questions.filter(
    (q) => q.section === currentSection && isConditionMet(q, responses)
  )

  const progress = computeProgress(questions, responses)
  const unanswered = unansweredBySection(questions, responses)
  const unansweredTotal = unanswered.socioeconomic + unanswered.behavioral + unanswered.environmental

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-[15px] text-apple-secondary">Carregando...</p>
      </div>
    )
  }

  const activeIndex = sections.indexOf(currentSection)

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-apple-text/5 z-50">
        <motion.div
          className="h-full bg-apple-green rounded-r-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Glass header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-[3px] z-10 border-b border-apple-glass-border safe-top">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full bg-apple-text/5 flex items-center justify-center hover:bg-apple-text/8 transition-colors"
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M7 1L1 7l6 6" stroke="#1B1B1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
          <div className="text-center">
            {readOnly ? (
              <span className="text-[13px] font-semibold text-apple-green">Sincronizado · somente leitura</span>
            ) : (
              <span className="text-[13px] font-semibold text-apple-secondary">{progress}%</span>
            )}
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>

        {/* Segmented control */}
        <div className="max-w-lg mx-auto px-5 pb-3">
          <div className="relative flex bg-apple-text/6 rounded-[10px] p-[2px]">
            <motion.div
              className="absolute top-[2px] bottom-[2px] bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
              initial={false}
              animate={{
                width: `calc(${100 / sections.length}% - 2px)`,
                left: `calc(${(activeIndex * 100) / sections.length}% + 1px)`,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
            {sections.map((s) => (
              <button
                key={s}
                onClick={() => setCurrentSection(s)}
                className={`relative z-10 flex-1 text-[13px] font-semibold py-2 rounded-[8px] transition-colors duration-200 ${
                  currentSection === s ? 'text-apple-text' : 'text-apple-secondary'
                }`}
              >
                <span className="sm:hidden">{sectionLabels[s]}</span>
                <span className="hidden sm:inline">{sectionFullLabels[s]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-5 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="space-y-3.5"
          >
            {sectionQuestions.map((q, i) => (
              <motion.div
                key={q.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
              >
                <QuestionCard
                  question={q}
                  value={responses.get(q.key)}
                  textValue={textValues.get(q.key) ?? ''}
                  readOnly={!!readOnly}
                  onChange={(val, text) => saveResponse(q.key, val, text)}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {currentSection === 'environmental' && !readOnly && (
          <div className="mt-6 safe-bottom pb-4">
            <motion.button
              onClick={handleFinishClick}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="w-full bg-apple-green text-white rounded-2xl py-4 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(34,163,82,0.25)]"
            >
              Finalizar Questionário
            </motion.button>
          </div>
        )}
      </main>

      {createPortal(
        <AnimatePresence>
          {showConfirmFinish && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
              onClick={() => setShowConfirmFinish(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                className="w-full max-w-lg bg-apple-card rounded-t-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-3 text-center">
                  <p className="text-[17px] font-bold text-apple-text">
                    {unansweredTotal} pergunta{unansweredTotal > 1 ? 's' : ''} sem resposta
                  </p>
                  <p className="text-[14px] text-apple-secondary mt-1">
                    {[
                      unanswered.socioeconomic > 0 ? `${unanswered.socioeconomic} Socioeconômico` : null,
                      unanswered.behavioral > 0 ? `${unanswered.behavioral} Comportamental` : null,
                      unanswered.environmental > 0 ? `${unanswered.environmental} Ambiental` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="px-5 pb-5 space-y-2">
                  <button
                    onClick={completeSurvey}
                    className="w-full h-12 rounded-xl bg-apple-green text-white text-[16px] font-semibold hover:bg-apple-green-hover transition-colors"
                  >
                    Finalizar mesmo assim
                  </button>
                  <button
                    onClick={() => setShowConfirmFinish(false)}
                    className="w-full h-12 rounded-xl bg-apple-text/5 text-[16px] font-semibold text-apple-text hover:bg-apple-text/8 transition-colors"
                    style={{ marginBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
                  >
                    Continuar respondendo
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

function QuestionCard({ question, value, textValue, readOnly, onChange }: {
  question: LocalQuestion
  value: unknown
  textValue: string
  readOnly: boolean
  onChange: (val: unknown, textValue?: string) => void
}) {
  return (
    <div className="bg-apple-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
      <p className="text-[12px] font-semibold text-apple-green tracking-wide uppercase mb-1">Pergunta {question.number}</p>
      <p className="text-[16px] font-semibold text-apple-text leading-snug mb-4">{question.text}</p>

      {(question.type === 'single_choice' || question.type === 'yes_no') && question.options && (
        <SingleChoice
          options={question.options}
          value={value as string}
          textValue={textValue}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
      {question.type === 'multiple_choice' && question.options && (
        <MultipleChoice
          options={question.options}
          value={(value as string[]) ?? []}
          textValue={textValue}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
      {question.type === 'scale' && (
        <ScaleInput
          min={question.scaleMin ?? 1}
          max={question.scaleMax ?? 5}
          value={value as number}
          readOnly={readOnly}
          onChange={(v) => onChange(v)}
        />
      )}
      {question.type === 'text' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className="w-full rounded-xl bg-apple-bg px-4 py-3 text-[16px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 min-h-[80px] placeholder:text-apple-tertiary transition-shadow disabled:opacity-60"
          placeholder="Digite sua resposta..."
        />
      )}
    </div>
  )
}

function OptionTextInput({ value, readOnly, onCommit }: {
  value: string
  readOnly: boolean
  onCommit: (text: string) => void
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      disabled={readOnly}
      className="mt-2 w-full rounded-xl bg-apple-bg px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 placeholder:text-apple-tertiary transition-shadow disabled:opacity-60"
      placeholder="Especifique..."
    />
  )
}

function SingleChoice({ options, value, textValue, readOnly, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string
  textValue: string
  readOnly: boolean
  onChange: (val: string, textValue?: string) => void
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <div key={opt.value}>
            <motion.button
              whileTap={readOnly ? undefined : { scale: 0.98 }}
              onClick={() => { if (!readOnly) onChange(opt.value, opt.hasTextInput ? textValue : undefined) }}
              disabled={readOnly}
              className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                selected
                  ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                  : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
              } ${readOnly ? 'cursor-default' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selected ? 'border-apple-green bg-apple-green' : 'border-apple-tertiary'
                }`}>
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 rounded-full bg-white"
                    />
                  )}
                </span>
                {opt.label}
              </span>
            </motion.button>
            {opt.hasTextInput && selected && (
              <OptionTextInput
                value={textValue}
                readOnly={readOnly}
                onCommit={(text) => onChange(opt.value, text)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function MultipleChoice({ options, value, textValue, readOnly, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string[]
  textValue: string
  readOnly: boolean
  onChange: (val: string[], textValue?: string) => void
}) {
  const textOption = options.find((o) => o.hasTextInput)

  const toggle = (optValue: string) => {
    const next = value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]
    const keepText = textOption && next.includes(textOption.value) ? textValue : undefined
    onChange(next, keepText)
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value)
        return (
          <div key={opt.value}>
            <motion.button
              whileTap={readOnly ? undefined : { scale: 0.98 }}
              onClick={() => { if (!readOnly) toggle(opt.value) }}
              disabled={readOnly}
              className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                selected
                  ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                  : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
              } ${readOnly ? 'cursor-default' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selected ? 'border-apple-green bg-apple-green' : 'border-apple-tertiary'
                }`}>
                  {selected && (
                    <motion.svg
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                    >
                      <path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </motion.svg>
                  )}
                </span>
                {opt.label}
              </span>
            </motion.button>
            {opt.hasTextInput && selected && (
              <OptionTextInput
                value={textValue}
                readOnly={readOnly}
                onCommit={(text) => onChange(value, text)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScaleInput({ min, max, value, readOnly, onChange }: {
  min: number
  max: number
  value: number
  readOnly: boolean
  onChange: (val: number) => void
}) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {points.map((n) => (
        <motion.button
          key={n}
          whileTap={readOnly ? undefined : { scale: 0.9 }}
          onClick={() => { if (!readOnly) onChange(n) }}
          disabled={readOnly}
          className={`w-12 h-12 rounded-[14px] text-[16px] font-semibold transition-all ${
            value === n
              ? 'bg-apple-green text-white shadow-[0_2px_8px_rgba(34,163,82,0.3)]'
              : 'bg-apple-bg text-apple-text hover:bg-apple-text/6'
          } ${readOnly ? 'cursor-default' : ''}`}
        >
          {n}
        </motion.button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b apps/web 2>&1 | head -20`
Expected: errors only in `SurveyListPage.tsx` (Task 14 fixes them).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/SurveyPage.tsx
git commit -m "fix(web): Outro text via textValue (persists/restores), accurate progress, finish confirmation, read-only for synced surveys"
```

---

### Task 13: NewSurveyPage — offline settlements from Dexie

**Files:**
- Modify: `apps/web/src/pages/NewSurveyPage.tsx`

**Interfaces:**
- Consumes: `getSettlements` (Task 11), `LocalSettlement` (Task 8).

- [ ] **Step 1: Swap the data source**

Replace the imports of `apiFetch` and the local `Settlement` interface with:

```tsx
import { db, type LocalSettlement } from '../lib/db'
import { getSettlements } from '../lib/sync'
```

Replace `const [settlements, setSettlements] = useState<Settlement[]>([])` with:

```tsx
  const [settlements, setSettlements] = useState<LocalSettlement[]>([])
```

Replace the `useEffect` with:

```tsx
  useEffect(() => {
    getSettlements().then(setSettlements).catch(() => {})
  }, [])
```

- [ ] **Step 2: Update the empty-state copy**

Replace the `<p>` "Nenhum assentamento cadastrado. Peça ao admin para cadastrar." with:

```tsx
<p className="text-[15px] text-apple-tertiary py-1">
  Nenhum assentamento disponível. Conecte-se à internet uma vez para baixar a lista.
</p>
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc -b apps/web 2>&1 | head -20` — expected: errors only in `SurveyListPage.tsx`.

```bash
git add apps/web/src/pages/NewSurveyPage.tsx
git commit -m "fix(web): start surveys offline using Dexie-cached settlements"
```

---

### Task 14: SurveyListPage — auto-sync, session-expired toast, unique toast ids, synced surveys clickable

**Files:**
- Modify: `apps/web/src/pages/SurveyListPage.tsx`

**Interfaces:**
- Consumes: `syncCompletedSurveys(): Promise<SyncStatus>`, `syncSettlements` (Task 11).

- [ ] **Step 1: Update imports and toast id generation**

Add `useRef` to the react import and `syncSettlements` to the sync import:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { syncCompletedSurveys, syncQuestions, syncSettlements, cleanupStaleSurveys, deleteLocalSurvey } from '../lib/sync'
```

Inside the component, replace `addToast` with a ref-sequenced version:

```tsx
  const toastSeq = useRef(0)
  const addToast = useCallback((type: ToastData['type'], message: string) => {
    const id = ++toastSeq.current
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])
```

- [ ] **Step 2: Replace `handleSync` with a status-driven `runSync` and wire auto-sync**

Replace the existing `useEffect` + `handleSync` with:

```tsx
  const runSync = useCallback(async (auto: boolean) => {
    setSyncing(true)
    try {
      const status = await syncCompletedSurveys()
      if (status.kind === 'nothing-pending') {
        if (!auto) addToast('info', 'Nenhum questionário pendente')
        return
      }
      if (status.kind === 'auth-expired') {
        addToast('error', 'Sessão expirada — entre novamente para sincronizar')
        return
      }
      if (status.kind === 'error') {
        if (!auto) addToast('error', 'Falha ao sincronizar. Tente novamente.')
        return
      }
      await cleanupStaleSurveys()
      await loadSurveys()
      if (status.syncedCount > 0) {
        addToast('success', `${status.syncedCount} questionário${status.syncedCount > 1 ? 's' : ''} sincronizado${status.syncedCount > 1 ? 's' : ''}`)
      }
      if (status.failedCount > 0) {
        addToast('error', `${status.failedCount} questionário${status.failedCount > 1 ? 's' : ''} falhou ao sincronizar`)
      }
    } finally {
      setSyncing(false)
    }
  }, [addToast])

  useEffect(() => {
    loadSurveys()
    syncQuestions()
    syncSettlements().then(() => cleanupStaleSurveys()).then(() => loadSurveys())
    if (navigator.onLine) runSync(true)
    const onOnline = () => runSync(true)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [runSync])
```

The sync button's `onClick` becomes `onClick={() => runSync(false)}`.

- [ ] **Step 3: Make synced surveys open in read-only mode**

Replace `to={s.status === 'synced' ? '#' : `/survey/${s.localId}`}` with:

```tsx
                  to={`/survey/${s.localId}`}
```

And remove the `{s.status !== 'synced' && (` wrapper around the chevron `<svg>` so the chevron always renders (delete the condition, keep the svg).

- [ ] **Step 4: Full web build**

Run: `npm run build -w @resa/web`
Expected: PASS (all web type errors resolved now).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/SurveyListPage.tsx
git commit -m "feat(web): auto-sync on open/reconnect, session-expired feedback, unique toast ids, synced surveys viewable"
```

---

### Task 15: AuthProvider — validate stored session when online

**Files:**
- Modify: `apps/web/src/lib/auth.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` (Task 8), existing `logout` from `./api`.

- [ ] **Step 1: Update the mount effect**

Replace the import line and `useEffect` in `apps/web/src/lib/auth.tsx`:

```tsx
import { login as apiLogin, logout as apiLogout, getStoredUser, apiFetch, ApiError } from './api'
```

```tsx
  useEffect(() => {
    const stored = getStoredUser()
    setUser(stored)
    setLoading(false)
    if (stored && navigator.onLine) {
      apiFetch('/auth/me').catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          apiLogout()
          setUser(null)
        }
        // Erro de rede: mantém a sessão local (offline-first)
      })
    }
  }, [])
```

- [ ] **Step 2: Build + commit**

Run: `npm run build -w @resa/web` — expected PASS.

```bash
git add apps/web/src/lib/auth.tsx
git commit -m "fix(web): drop expired sessions on load when online, keep offline sessions intact"
```

---

### Task 16: Admin — CSV export button + survey response viewer

**Files:**
- Modify: `apps/web/src/pages/AdminDashboardPage.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/export.csv` (Task 7), existing `GET /api/surveys/:id` (returns `{ ...survey, responses: [{ questionKey, value, textValue, answeredAt }] }`), existing `GET /api/admin/questions`.

- [ ] **Step 1: Extend the shared interfaces at the top of the file**

Below the existing `SurveyOverview` interface add:

```tsx
interface SurveyDetail extends SurveyOverview {
  gpsLat: number | null
  gpsLng: number | null
  syncedAt: string | null
  deviceInfo: string | null
  responses: { questionKey: string; value: unknown; textValue: string | null; answeredAt: string }[]
}
```

- [ ] **Step 2: Rework `OverviewTab`**

Replace the whole `function OverviewTab() { ... }` with:

```tsx
function OverviewTab() {
  const [surveys, setSurveys] = useState<SurveyOverview[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [detail, setDetail] = useState<SurveyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      apiFetch<SurveyOverview[]>('/surveys'),
      apiFetch<Settlement[]>('/settlements'),
      apiFetch<UserInfo[]>('/admin/users'),
      apiFetch<Question[]>('/admin/questions'),
    ]).then(([s, st, u, q]) => {
      setSurveys(s)
      setSettlements(st)
      setUsers(u)
      setQuestions(q)
    }).finally(() => setLoading(false))
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const token = localStorage.getItem('resa_token')
      const res = await fetch('/api/admin/export.csv', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Falha ao exportar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resa-survey-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Falha ao exportar CSV')
    } finally {
      setExporting(false)
    }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const d = await apiFetch<SurveyDetail>(`/surveys/${id}`)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  if (loading) return <p className="text-center text-[15px] text-apple-secondary py-12">Carregando...</p>

  const synced = surveys.filter(s => s.status === 'synced').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Questionários', value: surveys.length, color: 'text-apple-blue' },
          { label: 'Sincronizados', value: synced, color: 'text-apple-green' },
          { label: 'Assentamentos', value: settlements.length, color: 'text-apple-orange' },
          { label: 'Usuários', value: users.length, color: 'text-apple-purple' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] text-center"
          >
            <p className={`text-[28px] font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[12px] font-medium text-apple-secondary mt-0.5">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {surveys.length > 0 && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center justify-center gap-2 w-full bg-apple-card text-apple-green rounded-2xl py-3.5 text-[15px] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] hover:bg-apple-green/5 transition-colors disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </motion.button>
      )}

      {surveys.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#808086" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
          </div>
          <p className="text-[16px] font-medium text-apple-secondary">Nenhum questionário sincronizado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <h2 className="text-[13px] font-semibold text-apple-secondary uppercase tracking-wide px-1">Últimos questionários</h2>
          {surveys.slice(0, 10).map((s, i) => {
            const settlement = settlements.find(st => st.id === s.settlementId)
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => openDetail(s.id)}
                disabled={detailLoading}
                className="w-full text-left bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-apple-text truncate">{settlement?.name ?? `#${s.settlementId}`}</p>
                    <p className="text-[13px] text-apple-secondary mt-0.5">
                      {s.lotNumber ? `Lote ${s.lotNumber} · ` : ''}
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`text-[12px] font-semibold px-2.5 py-[3px] rounded-full whitespace-nowrap ${
                      s.status === 'synced' ? 'bg-apple-green/12 text-apple-green' : 'bg-apple-blue/12 text-apple-blue'
                    }`}>
                      {s.status === 'synced' ? 'Sincronizado' : s.status}
                    </span>
                    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="text-apple-tertiary flex-shrink-0">
                      <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      <SurveyDetailSheet
        detail={detail}
        settlements={settlements}
        users={users}
        questions={questions}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Add the `SurveyDetailSheet` component (below `OverviewTab`)**

```tsx
function formatResponseValue(question: Question | undefined, value: unknown): string {
  if (value == null) return '—'
  const labelFor = (v: string) => question?.options?.find((o) => o.value === v)?.label ?? v
  if (Array.isArray(value)) return value.map((v) => labelFor(String(v))).join(', ')
  if (typeof value === 'string') return labelFor(value)
  return String(value)
}

function SurveyDetailSheet({ detail, settlements, users, questions, onClose }: {
  detail: SurveyDetail | null
  settlements: Settlement[]
  users: UserInfo[]
  questions: Question[]
  onClose: () => void
}) {
  const settlement = detail ? settlements.find((s) => s.id === detail.settlementId) : undefined
  const interviewer = detail ? users.find((u) => u.id === detail.interviewerId) : undefined
  const byKey = new Map(questions.map((q) => [q.key, q]))
  const sortedResponses = detail
    ? [...detail.responses].sort((a, b) => (byKey.get(a.questionKey)?.sortOrder ?? 999) - (byKey.get(b.questionKey)?.sortOrder ?? 999))
    : []

  return createPortal(
    <AnimatePresence>
      {detail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="absolute bottom-0 left-0 right-0 sm:relative sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-apple-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-[0_-4px_40px_rgba(0,0,0,0.15)] max-h-[88dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-apple-text/10 mx-auto mt-2.5 mb-1 sm:hidden" />

            <div className="px-5 pt-3 pb-3 border-b border-apple-separator">
              <h3 className="text-[17px] font-bold text-apple-text">{settlement?.name ?? `Assentamento #${detail.settlementId}`}</h3>
              <p className="text-[13px] text-apple-secondary mt-0.5">
                {detail.lotNumber ? `Lote ${detail.lotNumber} · ` : ''}
                {interviewer?.name ?? `Entrevistador #${detail.interviewerId}`} · {new Date(detail.createdAt).toLocaleString('pt-BR')}
              </p>
              {detail.gpsLat != null && detail.gpsLng != null && (
                <p className="text-[12px] text-apple-tertiary mt-0.5">GPS: {detail.gpsLat.toFixed(5)}, {detail.gpsLng.toFixed(5)}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {sortedResponses.length === 0 ? (
                <p className="text-[14px] text-apple-tertiary text-center py-6">Sem respostas registradas.</p>
              ) : (
                sortedResponses.map((r) => {
                  const q = byKey.get(r.questionKey)
                  return (
                    <div key={r.questionKey} className="pb-3 border-b border-apple-separator last:border-b-0">
                      <p className="text-[12px] font-semibold text-apple-green uppercase tracking-wide">
                        {q ? `Pergunta ${q.number}` : r.questionKey}
                      </p>
                      <p className="text-[14px] text-apple-text mt-0.5">{q?.text ?? r.questionKey}</p>
                      <p className="text-[14px] font-semibold text-apple-text mt-1">
                        {formatResponseValue(q, r.value)}
                        {r.textValue ? <span className="font-normal text-apple-secondary"> — {r.textValue}</span> : null}
                      </p>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-5 pt-2 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-xl bg-apple-text/5 text-[16px] font-semibold text-apple-text hover:bg-apple-text/8 transition-colors"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
```

- [ ] **Step 4: Build + commit**

Run: `npm run build -w @resa/web` — expected PASS.

```bash
git add apps/web/src/pages/AdminDashboardPage.tsx
git commit -m "feat(admin): CSV export button and survey response viewer sheet"
```

---

### Task 17: Full verification, smoke test, docs

**Files:**
- Modify: `CLAUDE.md` (test commands note), `README.md` (scripts table)

- [ ] **Step 1: Full monorepo build + tests**

Run: `npm run build && npm run test`
Expected: turbo builds all 3 packages; vitest passes in `@resa/server` and `@resa/web`.

- [ ] **Step 2: Local smoke test (only if Postgres is reachable)**

Run: `pg_isready -h localhost -p 5432 && echo OK`
If OK:

```bash
npm run db:push -w @resa/server        # applies client_id/text_value columns
npm run db:seed -w @resa/server        # idempotent: re-creates questions, keeps admin
PORT=3999 npm run start -w @resa/server &   # boot compiled server
sleep 1
TOKEN=$(curl -s localhost:3999/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@resa.unemat.br","password":"admin123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
# same payload twice → second call must return the SAME localId as synced, without duplicating
BODY='{"deviceInfo":"smoke","syncedAt":"2026-07-01T12:00:00.000Z","surveys":[{"metadata":{"localId":"smoke-1","settlementId":1,"lotNumber":"1","status":"completed","createdAt":"2026-07-01T10:00:00.000Z","updatedAt":"2026-07-01T10:00:00.000Z"},"responses":[{"questionKey":"q01_idade","value":"21_30","answeredAt":"2026-07-01T10:00:00.000Z"}]}]}'
curl -s localhost:3999/api/sync -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY"
curl -s localhost:3999/api/sync -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BODY"
curl -s "localhost:3999/api/admin/export.csv" -H "Authorization: Bearer $TOKEN" | head -2
kill %1
```

Expected: both sync calls return `{"syncedLocalIds":["smoke-1"],"errors":[]}`; export shows the CSV header + one row. (Requires a settlement with id 1 — create via API if missing.)
If Postgres is not reachable: skip and note it in the final report.

- [ ] **Step 3: Update docs**

- `CLAUDE.md`: replace the sentence saying lint/test are unimplemented with: tests exist via Vitest in `@resa/server` and `@resa/web` (`npm run test`); `npm run lint` remains unimplemented. Add `JWT_SECRET` to the `.env` mention.
- `README.md`: add `npm run test` row to the scripts table.

- [ ] **Step 4: Final commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update test/env docs for plan 05"
```

---

## Self-Review (completed)

- **Spec coverage:** §1→Tasks 1–4; §2→Task 11; §3→Tasks 2, 8, 12; §4→Tasks 8, 11, 13; §5→Task 14; §6→Tasks 9, 12; §7→Tasks 8, 11, 14, 15; §8→Task 5; §9→Tasks 12, 14; §10.1→Tasks 6, 7, 16; §10.2→Task 16; §11→Tasks 3, 6, 9, 10; §12→Task 17; §13→documented only (not executed). No gaps.
- **Placeholders:** none — every code step carries full code.
- **Type consistency:** `SyncStatus` kinds (`nothing-pending`/`auth-expired`/`error`/`done`) match between Tasks 11 and 14; `SyncResult.syncedLocalIds` matches Tasks 1, 4, 10, 11; `textValue` naming consistent across Dexie/payload/zod/DB (`text_value` column); `LocalSettlement` shape matches Tasks 8, 11, 13.
