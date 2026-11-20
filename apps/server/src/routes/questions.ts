import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { questions } from '../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import { getCurrentVersion, isArchivedVersion, parseVersionParam, resolveNewQuestionVersion } from '../lib/questionnaire-version.js'

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
    exclusive: z.boolean().optional(),
  })).nullable().optional(),
  scaleMin: z.number().int().nullable().optional(),
  scaleMax: z.number().int().nullable().optional(),
  conditional: z.object({
    dependsOn: z.string(),
    showWhen: z.array(z.string()),
  }).nullable().optional(),
  sortOrder: z.number().int(),
  version: z.number().int().positive().optional(),
  groupKey: z.string().max(50).nullable().optional(),
  groupText: z.string().nullable().optional(),
  subsection: z.string().nullable().optional(),
  maxSelections: z.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
})

const ARCHIVED_ERROR = 'Pergunta de versão arquivada é somente leitura'

/** Perguntas de versões anteriores à vigente dão sentido a entrevistas já coletadas: não podem mudar. */
async function isArchived(id: number): Promise<boolean> {
  const [row] = await db.select({ version: questions.version }).from(questions).where(eq(questions.id, id))
  return !!row && isArchivedVersion(row.version, await getCurrentVersion(db))
}

export async function questionRoutes(app: FastifyInstance) {
  // Sem `version` a rota devolve a v1 (ver parseVersionParam): é o que o PWA
  // antigo em cache espera. O app atual pede `?version=current` ou `?version=N`.
  app.get<{ Querystring: { version?: string } }>('/api/questions', async (request, reply) => {
    const version = parseVersionParam(request.query.version, await getCurrentVersion(db))
    if (version === null) {
      return reply.status(400).send({ error: 'Parâmetro version inválido' })
    }
    return db.select().from(questions)
      .where(and(eq(questions.active, true), eq(questions.version, version)))
      .orderBy(asc(questions.sortOrder))
  })

  app.get('/api/admin/questions', { preHandler: [app.requireAdmin] }, async () => {
    return db.select().from(questions).orderBy(asc(questions.version), asc(questions.sortOrder))
  })

  app.post('/api/admin/questions', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = questionSchema.parse(request.body)
    const version = resolveNewQuestionVersion(body.version, await getCurrentVersion(db))
    if (version === null) {
      return reply.status(400).send({ error: 'Perguntas só podem ser criadas na versão vigente do questionário' })
    }
    const [question] = await db.insert(questions).values({ ...body, version }).returning()
    return reply.status(201).send(question)
  })

  app.put<{ Params: { id: string } }>('/api/admin/questions/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const body = questionSchema.partial().omit({ version: true }).parse(request.body)
    if (await isArchived(id)) {
      return reply.status(409).send({ error: ARCHIVED_ERROR })
    }
    const [updated] = await db.update(questions).set({ ...body, updatedAt: new Date() }).where(eq(questions.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Question not found' })
    }
    return updated
  })

  app.delete<{ Params: { id: string } }>('/api/admin/questions/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    if (await isArchived(id)) {
      return reply.status(409).send({ error: ARCHIVED_ERROR })
    }
    const [updated] = await db.update(questions).set({ active: false, updatedAt: new Date() }).where(eq(questions.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Question not found' })
    }
    return { success: true }
  })
}
