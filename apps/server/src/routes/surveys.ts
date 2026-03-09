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
  app.get('/api/surveys', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user
    if (user.role === 'admin') {
      return db.select().from(surveys).orderBy(desc(surveys.createdAt))
    }
    return db.select().from(surveys).where(eq(surveys.interviewerId, user.id)).orderBy(desc(surveys.createdAt))
  })

  app.get<{ Params: { id: string } }>('/api/surveys/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = Number(request.params.id)
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, id))
    if (!survey) {
      return reply.status(404).send({ error: 'Survey not found' })
    }
    if (request.user.role !== 'admin' && survey.interviewerId !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    const surveyResponses = await db.select().from(responses).where(eq(responses.surveyId, id))
    return { ...survey, responses: surveyResponses }
  })

  app.post('/api/admin/surveys', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = z.object({
      settlementId: z.number(),
      interviewerId: z.number(),
      lotNumber: z.string().optional(),
    }).parse(request.body)

    const [created] = await db.insert(surveys).values({
      settlementId: body.settlementId,
      interviewerId: body.interviewerId,
      lotNumber: body.lotNumber ?? null,
      status: 'draft',
    }).returning()

    return reply.status(201).send(created)
  })

  app.delete<{ Params: { id: string } }>('/api/admin/surveys/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    await db.delete(responses).where(eq(responses.surveyId, id))
    const [deleted] = await db.delete(surveys).where(eq(surveys.id, id)).returning()
    if (!deleted) {
      return reply.status(404).send({ error: 'Survey not found' })
    }
    return { success: true }
  })

  app.post('/api/sync', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = syncPayloadSchema.parse(request.body)
    const syncedIds: number[] = []
    const errors: { index: number; message: string }[] = []

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')

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

    if (syncedIds.length > 0) {
      await db.insert(syncLog).values({
        surveyId: syncedIds[0],
        deviceInfo: body.deviceInfo,
        payloadHash,
      })
    }

    return reply.status(201).send({ syncedIds, errors })
  })
}
