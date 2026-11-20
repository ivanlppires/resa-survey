import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { users } from './schema.js'
import { ensureQuestionnaires } from './ensure-questionnaires.js'
import { shouldBootstrapAdmin } from './bootstrap-admin.js'

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle({ client })

async function seed() {
  // Roda em todo boot do container: só insere versões do questionário que
  // ainda não existem no banco. Nunca apaga nem altera perguntas existentes.
  const inserted = await ensureQuestionnaires(db)
  console.log(inserted.length > 0
    ? `Questionário: versões inseridas: ${inserted.join(', ')}.`
    : 'Questionário: todas as versões já presentes, nada a inserir.')

  // Admin inicial: apenas em instalação nova (nenhum usuário no banco).
  const userCount = await db.$count(users)
  if (shouldBootstrapAdmin(userCount)) {
    const passwordHash = await bcrypt.hash('admin123', 10)
    await db.insert(users).values({
      name: 'Admin RESA',
      email: 'admin@resa.unemat.br',
      passwordHash,
      role: 'admin',
    })
    console.log('Created admin user: admin@resa.unemat.br (troque a senha no primeiro acesso)')
  } else {
    console.log('Usuários já existem; admin inicial não é criado.')
  }

  await client.end()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
