import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { users } from './schema.js'
import { ensureQuestionnaires } from './ensure-questionnaires.js'

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle({ client })

async function seed() {
  // Roda em todo boot do container: só insere versões do questionário que
  // ainda não existem no banco. Nunca apaga nem altera perguntas existentes.
  const inserted = await ensureQuestionnaires(db)
  console.log(inserted.length > 0
    ? `Questionário: versões inseridas: ${inserted.join(', ')}.`
    : 'Questionário: todas as versões já presentes, nada a inserir.')

  // Seed admin user
  const existingAdmin = await db.select().from(users).where(eq(users.email, 'admin@resa.unemat.br'))
  if (existingAdmin.length === 0) {
    const passwordHash = await bcrypt.hash('admin123', 10)
    await db.insert(users).values({
      name: 'Admin RESA',
      email: 'admin@resa.unemat.br',
      passwordHash,
      role: 'admin',
    })
    console.log('Created admin user: admin@resa.unemat.br')
  } else {
    console.log('Admin user already exists.')
  }

  await client.end()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
