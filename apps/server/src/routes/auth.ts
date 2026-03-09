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
