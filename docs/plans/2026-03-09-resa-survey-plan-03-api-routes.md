# RESA Survey - Plan 03: REST API Routes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the core REST API: authentication (JWT + bcrypt), questions CRUD for admin, settlements CRUD, surveys listing, and the offline sync endpoint.

**Architecture:** Fastify route plugins registered on the app. JWT auth via @fastify/jwt with a decorator for route protection. Bcrypt for password hashing. All routes under /api/. Admin-only routes check user role.

**Tech Stack:** Fastify 5, @fastify/jwt, bcrypt, drizzle-orm, zod (for request validation)

---

## Task 1: Install API dependencies

**Files:**
- Modify: `apps/server/package.json`

**Step 1: Install packages**

```bash
cd /home/ivanpires/Business/resa/resa-survey && npm install @fastify/jwt bcryptjs zod --workspace=apps/server && npm install -D @types/bcryptjs --workspace=apps/server
```

**Step 2: Commit**

```bash
git add apps/server/package.json package-lock.json
git commit -m "feat: add jwt, bcrypt, and zod dependencies"
```

---

## Task 2: Auth plugin and middleware

**Files:**
- Create: `apps/server/src/plugins/auth.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Create apps/server/src/plugins/auth.ts**

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fjwt from '@fastify/jwt'

export async function authPlugin(app: FastifyInstance) {
  await app.register(fjwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  })

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const user = request.user as { role: string }
      if (user.role !== 'admin') {
        reply.status(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}
```

**Step 2: Create apps/server/src/types/fastify.d.ts for type augmentation**

```typescript
import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; email: string; role: string }
    user: { id: number; email: string; role: string }
  }
}
```

**Step 3: Register auth plugin in apps/server/src/index.ts**

Add `import { authPlugin } from './plugins/auth.js'` and register it before routes:
`await app.register(authPlugin)`

**Step 4: Verify TypeScript compiles**

```bash
cd /home/ivanpires/Business/resa/resa-survey/apps/server && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add apps/server/src/plugins/ apps/server/src/types/ apps/server/src/index.ts
git commit -m "feat: add JWT auth plugin with authenticate and requireAdmin decorators"
```

---

## Task 3: Auth routes (register + login)

**Files:**
- Create: `apps/server/src/routes/auth.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Create apps/server/src/routes/auth.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'interviewer', 'viewer']).default('interviewer'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register — admin-only
  app.post('/api/auth/register', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const existing = await db.select().from(users).where(eq(users.email, body.email))
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' })
    }
    const passwordHash = await bcrypt.hash(body.password, 10)
    const [user] = await db.insert(users).values({
      name: body.name,
      email: body.email,
      passwordHash,
      role: body.role,
    }).returning({ id: users.id, name: users.name, email: users.email, role: users.role })
    return reply.status(201).send(user)
  })

  // POST /api/auth/login
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const [user] = await db.select().from(users).where(eq(users.email, body.email))
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
    const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role }, { expiresIn: '7d' })
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
  })

  // GET /api/auth/me — get current user
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.user
    const [user] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, id))
    return user
  })
}
```

**Step 2: Register auth routes in index.ts**

Add `import { authRoutes } from './routes/auth.js'` and `await app.register(authRoutes)`.

**Step 3: Add a Zod error handler in index.ts**

After creating the Fastify instance, add:
```typescript
import { ZodError } from 'zod'

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'Validation error', details: error.issues })
  }
  reply.status(error.statusCode ?? 500).send({ error: error.message })
})
```

**Step 4: Commit**

```bash
git add apps/server/src/routes/auth.ts apps/server/src/index.ts
git commit -m "feat: add auth routes (register, login, me)"
```

---

## Task 4: Seed an initial admin user

**Files:**
- Modify: `apps/server/src/db/seed.ts`

**Step 1: Add admin user seeding to the existing seed.ts**

After the questions seed block, add:

```typescript
import { users } from './schema.js'
import bcrypt from 'bcryptjs'

// ... existing question seed code ...

// Seed admin user
const existingAdmin = await db.select().from(users).where(eq(users.email, 'admin@resa.unemat.br'))
if (existingAdmin.length === 0) {
  const passwordHash = await bcrypt.hash('admin123', 10)
  await db.insert(users).values({
    name: 'Admin RESA',
    email: 'admin@resa.unemat.br',
    passwordHash,
    role: 'admin',
  })
  console.log('Created admin user: admin@resa.unemat.br')
} else {
  console.log('Admin user already exists.')
}
```

**Step 2: Run seed**

```bash
cd /home/ivanpires/Business/resa/resa-survey/apps/server && npx tsx src/db/seed.ts
```

**Step 3: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat: add admin user seeding to seed script"
```

---

## Task 5: Questions CRUD routes (admin)

**Files:**
- Create: `apps/server/src/routes/questions.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Create apps/server/src/routes/questions.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { questions } from '../db/schema.js'
import { eq, asc } from 'drizzle-orm'

const questionSchema = z.object({
  key: z.string().min(1).max(50),
  number: z.number().int(),
  text: z.string().min(1),
  type: z.enum(['single_choice', 'multiple_choice', 'yes_no', 'scale', 'text']),
  section: z.enum(['socioeconomic', 'behavioral', 'environmental']),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    hasTextInput: z.boolean().optional(),
  })).nullable().optional(),
  scaleMin: z.number().int().nullable().optional(),
  scaleMax: z.number().int().nullable().optional(),
  conditional: z.object({
    dependsOn: z.string(),
    showWhen: z.array(z.string()),
  }).nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean().default(true),
})

export async function questionRoutes(app: FastifyInstance) {
  // GET /api/questions — list all active questions (public, for survey app)
  app.get('/api/questions', async () => {
    return db.select().from(questions).where(eq(questions.active, true)).orderBy(asc(questions.sortOrder))
  })

  // GET /api/admin/questions — list ALL questions including inactive (admin)
  app.get('/api/admin/questions', { preHandler: [app.requireAdmin] }, async () => {
    return db.select().from(questions).orderBy(asc(questions.sortOrder))
  })

  // POST /api/admin/questions — create question
  app.post('/api/admin/questions', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = questionSchema.parse(request.body)
    const [question] = await db.insert(questions).values(body).returning()
    return reply.status(201).send(question)
  })

  // PUT /api/admin/questions/:id — update question
  app.put<{ Params: { id: string } }>('/api/admin/questions/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const body = questionSchema.partial().parse(request.body)
    const [updated] = await db.update(questions).set({ ...body, updatedAt: new Date() }).where(eq(questions.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Question not found' })
    }
    return updated
  })

  // DELETE /api/admin/questions/:id — soft delete (set active=false)
  app.delete<{ Params: { id: string } }>('/api/admin/questions/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const [updated] = await db.update(questions).set({ active: false, updatedAt: new Date() }).where(eq(questions.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Question not found' })
    }
    return { success: true }
  })
}
```

**Step 2: Register in index.ts**

Add `import { questionRoutes } from './routes/questions.js'` and `await app.register(questionRoutes)`.

**Step 3: Commit**

```bash
git add apps/server/src/routes/questions.ts apps/server/src/index.ts
git commit -m "feat: add questions CRUD routes (public list + admin CRUD)"
```

---

## Task 6: Settlements CRUD routes

**Files:**
- Create: `apps/server/src/routes/settlements.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Create apps/server/src/routes/settlements.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { settlements } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const settlementSchema = z.object({
  name: z.string().min(1),
  municipality: z.string().min(1),
  biome: z.string().min(1),
  geojson: z.any().nullable().optional(),
  metadata: z.any().nullable().optional(),
})

export async function settlementRoutes(app: FastifyInstance) {
  // GET /api/settlements — list all
  app.get('/api/settlements', async () => {
    return db.select().from(settlements)
  })

  // GET /api/settlements/:id
  app.get<{ Params: { id: string } }>('/api/settlements/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id))
    if (!settlement) {
      return reply.status(404).send({ error: 'Settlement not found' })
    }
    return settlement
  })

  // POST /api/admin/settlements — create (admin)
  app.post('/api/admin/settlements', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = settlementSchema.parse(request.body)
    const [created] = await db.insert(settlements).values(body).returning()
    return reply.status(201).send(created)
  })

  // PUT /api/admin/settlements/:id — update (admin)
  app.put<{ Params: { id: string } }>('/api/admin/settlements/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const body = settlementSchema.partial().parse(request.body)
    const [updated] = await db.update(settlements).set(body).where(eq(settlements.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Settlement not found' })
    }
    return updated
  })

  // DELETE /api/admin/settlements/:id — hard delete (admin)
  app.delete<{ Params: { id: string } }>('/api/admin/settlements/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const [deleted] = await db.delete(settlements).where(eq(settlements.id, id)).returning()
    if (!deleted) {
      return reply.status(404).send({ error: 'Settlement not found' })
    }
    return { success: true }
  })
}
```

**Step 2: Register in index.ts**

Add `import { settlementRoutes } from './routes/settlements.js'` and `await app.register(settlementRoutes)`.

**Step 3: Commit**

```bash
git add apps/server/src/routes/settlements.ts apps/server/src/index.ts
git commit -m "feat: add settlements CRUD routes"
```

---

## Task 7: Surveys listing + sync endpoint

**Files:**
- Create: `apps/server/src/routes/surveys.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Create apps/server/src/routes/surveys.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { surveys, responses, syncLog } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import crypto from 'node:crypto'

const syncPayloadSchema = z.object({
  surveys: z.array(z.object({
    metadata: z.object({
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
      answeredAt: z.string(),
    })),
  })),
  deviceInfo: z.string(),
  syncedAt: z.string(),
})

export async function surveyRoutes(app: FastifyInstance) {
  // GET /api/surveys — list surveys (authenticated)
  app.get('/api/surveys', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user
    // Admin sees all, interviewers see only their own
    if (user.role === 'admin') {
      return db.select().from(surveys).orderBy(desc(surveys.createdAt))
    }
    return db.select().from(surveys).where(eq(surveys.interviewerId, user.id)).orderBy(desc(surveys.createdAt))
  })

  // GET /api/surveys/:id — survey detail with responses (authenticated)
  app.get<{ Params: { id: string } }>('/api/surveys/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = Number(request.params.id)
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, id))
    if (!survey) {
      return reply.status(404).send({ error: 'Survey not found' })
    }
    // Non-admin can only see their own
    if (request.user.role !== 'admin' && survey.interviewerId !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    const surveyResponses = await db.select().from(responses).where(eq(responses.surveyId, id))
    return { ...survey, responses: surveyResponses }
  })

  // POST /api/sync — receive batch of surveys from offline app (authenticated)
  app.post('/api/sync', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = syncPayloadSchema.parse(request.body)
    const syncedIds: number[] = []
    const errors: { index: number; message: string }[] = []

    // Hash payload for idempotency
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')

    // Check for duplicate sync
    const [existingSync] = await db.select().from(syncLog).where(eq(syncLog.payloadHash, payloadHash))
    if (existingSync) {
      return { syncedIds: [], errors: [], message: 'Already synced (duplicate payload)' }
    }

    for (let i = 0; i < body.surveys.length; i++) {
      const surveyData = body.surveys[i]
      try {
        const [created] = await db.insert(surveys).values({
          settlementId: surveyData.metadata.settlementId,
          interviewerId: request.user.id,
          lotNumber: surveyData.metadata.lotNumber ?? null,
          gpsLat: surveyData.metadata.gpsLat ?? null,
          gpsLng: surveyData.metadata.gpsLng ?? null,
          status: 'synced',
          deviceInfo: surveyData.metadata.deviceInfo ?? null,
          createdAt: new Date(surveyData.metadata.createdAt),
          updatedAt: new Date(surveyData.metadata.updatedAt),
          completedAt: surveyData.metadata.completedAt ? new Date(surveyData.metadata.completedAt) : null,
          syncedAt: new Date(),
        }).returning({ id: surveys.id })

        if (surveyData.responses.length > 0) {
          await db.insert(responses).values(
            surveyData.responses.map((r) => ({
              surveyId: created.id,
              questionKey: r.questionKey,
              value: r.value,
              answeredAt: new Date(r.answeredAt),
            }))
          )
        }

        syncedIds.push(created.id)
      } catch (err) {
        errors.push({ index: i, message: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    // Log sync
    await db.insert(syncLog).values({
      surveyId: syncedIds[0] ?? 0,
      deviceInfo: body.deviceInfo,
      payloadHash,
    })

    return reply.status(201).send({ syncedIds, errors })
  })
}
```

**Step 2: Register in index.ts**

Add `import { surveyRoutes } from './routes/surveys.js'` and `await app.register(surveyRoutes)`.

**Step 3: Commit**

```bash
git add apps/server/src/routes/surveys.ts apps/server/src/index.ts
git commit -m "feat: add surveys listing and sync endpoint"
```

---

## Task 8: Integration test — full API flow

**Step 1: Build and start the server**

```bash
cd /home/ivanpires/Business/resa/resa-survey && npx turbo build
cd apps/server && npx tsx src/index.ts &
```

**Step 2: Test login with seeded admin**

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@resa.unemat.br","password":"admin123"}'
```
Expected: Returns `{ token: "...", user: { id, name, email, role: "admin" } }`

**Step 3: Test questions list**

```bash
curl -s http://localhost:3000/api/questions | jq 'length'
```
Expected: 70

**Step 4: Test admin question create (using token from step 2)**

```bash
TOKEN=<token from step 2>
curl -s -X POST http://localhost:3000/api/admin/questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"key":"q_test","number":99,"text":"Test question","type":"yes_no","section":"socioeconomic","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}],"sortOrder":999}'
```
Expected: 201 with created question

**Step 5: Test admin question delete**

```bash
curl -s -X DELETE http://localhost:3000/api/admin/questions/<id from step 4> \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `{ success: true }`

**Step 6: Kill server, commit if needed**

---

## Summary

After completing this plan:

```
apps/server/src/
├── db/
│   ├── index.ts            # DB connection
│   ├── schema.ts           # Tables + relations
│   └── seed.ts             # Seeds questions + admin user
├── plugins/
│   └── auth.ts             # JWT + auth decorators
├── routes/
│   ├── auth.ts             # POST login, POST register (admin), GET me
│   ├── health.ts           # GET /api/health
│   ├── questions.ts        # GET public list, admin CRUD
│   ├── settlements.ts      # GET list, admin CRUD
│   └── surveys.ts          # GET list, GET detail, POST sync
├── types/
│   └── fastify.d.ts        # Type augmentation for JWT
└── index.ts                # Entry point
```

API endpoints:
- `POST /api/auth/login` — login, returns JWT
- `POST /api/auth/register` — admin-only, create users
- `GET /api/auth/me` — current user info
- `GET /api/questions` — active questions for survey app
- `GET /api/admin/questions` — all questions (admin)
- `POST /api/admin/questions` — create question (admin)
- `PUT /api/admin/questions/:id` — update question (admin)
- `DELETE /api/admin/questions/:id` — soft delete question (admin)
- `GET /api/settlements` — list settlements
- `GET /api/settlements/:id` — settlement detail
- `POST /api/admin/settlements` — create (admin)
- `PUT /api/admin/settlements/:id` — update (admin)
- `DELETE /api/admin/settlements/:id` — delete (admin)
- `GET /api/surveys` — list surveys (own or all if admin)
- `GET /api/surveys/:id` — survey with responses
- `POST /api/sync` — offline sync endpoint (idempotent)

**Next plan:** Plan 04 — PWA frontend (survey flow UI, offline storage with Dexie.js)
