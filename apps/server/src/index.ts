import 'dotenv/config'
import path from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { ZodError } from 'zod'
import { authPlugin } from './plugins/auth.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { questionRoutes } from './routes/questions.js'
import { settlementRoutes } from './routes/settlements.js'
import { surveyRoutes } from './routes/surveys.js'
import { exportRoutes } from './routes/export.js'

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
await app.register(surveyRoutes)
await app.register(exportRoutes)

// Em produção containerizada o próprio servidor serve o build do PWA
// (STATIC_DIR aponta para apps/web/dist); em dev/Nginx isso fica desligado.
const staticDir = process.env.STATIC_DIR
if (staticDir) {
  await app.register(fastifyStatic, { root: path.resolve(staticDir) })
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })
}

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
