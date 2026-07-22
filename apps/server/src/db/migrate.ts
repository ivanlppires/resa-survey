import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL!, { max: 1 })
const db = drizzle({ client })

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

try {
  await migrate(db, { migrationsFolder })
  console.log('Migrations applied.')
} finally {
  await client.end()
}
