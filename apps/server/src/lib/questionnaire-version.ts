import { max } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { questions } from '../db/schema.js'
import type { CsvQuestion } from './csv.js'

type Db = PostgresJsDatabase<Record<string, unknown>>

/** Versão vigente do questionário = a maior versão com perguntas no banco. */
export async function getCurrentVersion(db: Db): Promise<number> {
  const [row] = await db.select({ value: max(questions.version) }).from(questions)
  return row?.value ?? 1
}

/** Mapa chave → versão de todas as perguntas, para classificar respostas no sync. */
export async function loadVersionByKey(db: Db): Promise<Map<string, number>> {
  const rows = await db.select({ key: questions.key, version: questions.version }).from(questions)
  return new Map(rows.map((r) => [r.key, r.version]))
}

/**
 * Interpreta o parâmetro `version` de GET /api/questions.
 * Sem parâmetro → 1: o PWA antigo (em cache no celular) chama a rota sem
 * parâmetro e substitui todo o cache pelo que recebe; ele precisa continuar
 * vendo a v1 até se atualizar. Devolve null para valor inválido.
 */
export function parseVersionParam(raw: string | undefined, current: number): number | null {
  if (raw === undefined) return 1
  if (raw === 'current') return current
  if (!/^[1-9]\d*$/.test(raw)) return null
  return Number(raw)
}

/**
 * Versão do questionário de uma entrevista recebida no sync. As chaves das
 * respostas mandam (o app antigo não declara versão); a versão declarada só
 * vale quando nenhuma chave é conhecida (e se existir no servidor — senão, a
 * vigente); na falta de tudo, v1.
 * `mixed` sinaliza respostas de mais de uma versão — a entrevista é gravada
 * mesmo assim, com a versão da maioria (empate → a maior).
 */
export function deriveQuestionnaireVersion(
  responseKeys: string[],
  versionByKey: Map<string, number>,
  payloadVersion?: number,
): { version: number; mixed: boolean } {
  const counts = new Map<number, number>()
  for (const key of responseKeys) {
    const v = versionByKey.get(key)
    if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  if (counts.size === 0) {
    // A versão declarada só vale se existir no servidor; senão a entrevista
    // ficaria invisível no painel (que só lista versões com perguntas).
    const known = new Set(versionByKey.values())
    const declared = payloadVersion ?? 1
    const version = known.size === 0 || known.has(declared) ? declared : Math.max(...known)
    return { version, mixed: false }
  }
  const [version] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
  return { version, mixed: counts.size > 1 }
}

/**
 * Versão do questionário de um export: uma entrevista sai sempre na versão
 * dela; senão vale a versão pedida; sem filtro, a vigente.
 */
export function resolveExportVersion(input: { version?: number; surveyVersion?: number; current: number }): number {
  return input.surveyVersion ?? input.version ?? input.current
}

/** Colunas de pergunta do CSV/XLSX: uma por pergunta, mais `_texto` quando há alternativa com texto livre. */
export function toCsvQuestions(
  rows: { key: string; sortOrder: number; options?: { hasTextInput?: boolean }[] | null }[],
): CsvQuestion[] {
  return rows.map((q) => ({
    key: q.key,
    sortOrder: q.sortOrder,
    hasTextOption: (q.options ?? []).some((o) => !!o.hasTextInput),
  }))
}

/**
 * Perguntas de versões anteriores à vigente dão sentido a entrevistas já
 * coletadas: são arquivo e não podem ser editadas nem desativadas.
 */
export function isArchivedVersion(questionVersion: number, current: number): boolean {
  return questionVersion < current
}

/**
 * Versão de uma pergunta criada pelo admin: sempre a vigente. Devolve null
 * para qualquer outra — criar em versão arquivada mudaria o arquivo (e o que
 * o app antigo baixa); criar em versão futura a tornaria a vigente com uma
 * única pergunta. Versão nova entra por código (questionnaires/vN.ts).
 */
export function resolveNewQuestionVersion(requested: number | undefined, current: number): number | null {
  if (requested === undefined || requested === current) return current
  return null
}

/**
 * Quantas respostas de uma entrevista são de perguntas de OUTRA versão que não
 * a da entrevista. Essas respostas ficam gravadas, mas não aparecem no export
 * da versão da entrevista. Chaves desconhecidas não contam.
 */
export function foreignResponseCount(
  responseKeys: string[],
  versionByKey: Map<string, number>,
  surveyVersion: number,
): number {
  return responseKeys.filter((k) => {
    const v = versionByKey.get(k)
    return v !== undefined && v !== surveyVersion
  }).length
}
