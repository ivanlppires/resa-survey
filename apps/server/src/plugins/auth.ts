import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fjwt from '@fastify/jwt'
import fp from 'fastify-plugin'

async function auth(app: FastifyInstance) {
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

export const authPlugin = fp(auth)
