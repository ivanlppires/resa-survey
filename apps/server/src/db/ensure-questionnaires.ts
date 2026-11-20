import { count } from 'drizzle-orm'
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

/**
 * Versões que existem no banco com um número de perguntas diferente do
 * definido no código (ex.: carga interrompida, pergunta criada ou removida à
 * mão). A carga não as corrige — só serve para avisar no log do boot.
 */
export function incompleteVersions(
  countsByVersion: Map<number, number>,
  definedCounts: Record<number, number>,
): { version: number; existing: number; expected: number }[] {
  return Object.entries(definedCounts)
    .map(([version, expected]) => ({ version: Number(version), existing: countsByVersion.get(Number(version)), expected }))
    .filter((v): v is { version: number; existing: number; expected: number } => v.existing !== undefined && v.existing !== v.expected)
    .sort((a, b) => a.version - b.version)
}

/** Contagem de perguntas por versão no banco comparada com o código. */
export async function findIncompleteVersions(db: PostgresJsDatabase<Record<string, unknown>>) {
  const rows = await db.select({ version: questions.version, total: count() }).from(questions).groupBy(questions.version)
  return incompleteVersions(
    new Map(rows.map((r) => [r.version, r.total])),
    Object.fromEntries(Object.entries(questionnaires).map(([v, qs]) => [v, qs.length])),
  )
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
