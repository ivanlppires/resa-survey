import Fastify from 'fastify'
import { healthRoutes } from './routes/health.js'

const app = Fastify({ logger: true })

await app.register(healthRoutes)

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
