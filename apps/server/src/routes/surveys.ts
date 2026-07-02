import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { surveys, responses, syncLog } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import crypto from 'node:crypto'
import { syncPayloadSchema } from './sync-schema.js'

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
}
