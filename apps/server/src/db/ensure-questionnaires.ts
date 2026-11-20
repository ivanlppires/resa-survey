import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { questions } from './schema.js'
import { questionnaires } from './questionnaires/index.js'

/**
 * Versões definidas no código que ainda não têm NENHUMA pergunta no banco.
 * Uma versão parcialmente presente conta como presente: a carga nunca
 * completa, atualiza nem apaga perguntas existentes.
 */
export function versionsToInsert(existingVersions: number[], definedVersions: number[]): number[] {
  const existing = new Set(existingVersions)
  return definedVersions.filter((v) => !existing.has(v)).sort((a, b) => a - b)
}

/** Insere por inteiro cada versão do questionário que falta no banco. Idempotente. */
export async function ensureQuestionnaires(db: PostgresJsDatabase<Record<string, unknown>>): Promise<number[]> {
  const rows = await db.selectDistinct({ version: questions.version }).from(questions)
  const missing = versionsToInsert(rows.map((r) => r.version), Object.keys(questionnaires).map(Number))
  for (const version of missing) {
    await db.transaction(async (tx) => {
      await tx.insert(questions).values(questionnaires[version])
    })
  }
  return missing
}
