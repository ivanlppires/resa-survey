import 'dotenv/config'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { authPlugin } from './plugins/auth.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { questionRoutes } from './routes/questions.js'
import { settlementRoutes } from './routes/settlements.js'

const app = Fastify({ logger: true })

app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'Validation error', details: error.issues })
  }
  reply.status(error.statusCode ?? 500).send({ error: error.message })
})

await app.register(authPlugin)
await app.register(healthRoutes)
await app.register(authRoutes)
await app.register(questionRoutes)
await app.register(settlementRoutes)

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
