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
  app.get('/api/questions', async () => {
    return db.select().from(questions).where(eq(questions.active, true)).orderBy(asc(questions.sortOrder))
  })

  app.get('/api/admin/questions', { preHandler: [app.requireAdmin] }, async () => {
    return db.select().from(questions).orderBy(asc(questions.sortOrder))
  })

  app.post('/api/admin/questions', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = questionSchema.parse(request.body)
    const [question] = await db.insert(questions).values(body).returning()
    return reply.status(201).send(question)
  })

  app.put<{ Params: { id: string } }>('/api/admin/questions/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const body = questionSchema.partial().parse(request.body)
    const [updated] = await db.update(questions).set({ ...body, updatedAt: new Date() }).where(eq(questions.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Question not found' })
    }
    return updated
  })

  app.delete<{ Params: { id: string } }>('/api/admin/questions/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const [updated] = await db.update(questions).set({ active: false, updatedAt: new Date() }).where(eq(questions.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Question not found' })
    }
    return { success: true }
  })
}
