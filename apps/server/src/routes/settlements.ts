import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { settlements, userSettlements } from '../db/schema.js'
import { eq, inArray } from 'drizzle-orm'

const settlementSchema = z.object({
  name: z.string().min(1),
  municipality: z.string().min(1),
  biome: z.string().min(1),
  geojson: z.any().nullable().optional(),
  metadata: z.any().nullable().optional(),
})

export async function settlementRoutes(app: FastifyInstance) {
  app.get('/api/settlements', { preHandler: [app.authenticate] }, async (request) => {
    if (request.user.role === 'admin') {
      return db.select().from(settlements)
    }
    const assigned = await db.select({ settlementId: userSettlements.settlementId })
      .from(userSettlements)
      .where(eq(userSettlements.userId, request.user.id))
    const ids = assigned.map((r) => r.settlementId)
    if (ids.length === 0) return []
    return db.select().from(settlements).where(inArray(settlements.id, ids))
  })

  app.get<{ Params: { id: string } }>('/api/settlements/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id))
    if (!settlement) {
      return reply.status(404).send({ error: 'Settlement not found' })
    }
    return settlement
  })

  app.post('/api/admin/settlements', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = settlementSchema.parse(request.body)
    const [created] = await db.insert(settlements).values(body).returning()
    return reply.status(201).send(created)
  })

  app.put<{ Params: { id: string } }>('/api/admin/settlements/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const body = settlementSchema.partial().parse(request.body)
    const [updated] = await db.update(settlements).set(body).where(eq(settlements.id, id)).returning()
    if (!updated) {
      return reply.status(404).send({ error: 'Settlement not found' })
    }
    return updated
  })

  app.delete<{ Params: { id: string } }>('/api/admin/settlements/:id', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const id = Number(request.params.id)
    const [deleted] = await db.delete(settlements).where(eq(settlements.id, id)).returning()
    if (!deleted) {
      return reply.status(404).send({ error: 'Settlement not found' })
    }
    return { success: true }
  })
}
