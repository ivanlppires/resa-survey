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
