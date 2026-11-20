import { db, type LocalQuestion, type LocalResponse, type LocalSettlement } from './db'
import { apiFetch, ApiError } from './api'
import { buildSyncPayload, resolveSyncOutcome } from './sync-helpers'
import { versionsToKeep } from './questionnaire'
import type { SyncResult } from '@resa/shared'

/**
 * Atualiza o cache com as perguntas da versão vigente. Mantém no cache as
 * versões de entrevistas locais ainda não sincronizadas, para que possam ser
 * concluídas offline com o questionário em que começaram. Sem rede, o cache
 * fica como está.
 */
export async function syncQuestions(): Promise<void> {
  let fetched: LocalQuestion[]
  try {
    fetched = await apiFetch<LocalQuestion[]>('/questions?version=current')
  } catch {
    return // Offline — usa perguntas em cache
  }
  if (fetched.length === 0) return
  const current = fetched[0].version

  await db.transaction('rw', db.questions, db.surveys, db.responses, async () => {
    const surveys = await db.surveys.toArray()
    // Rascunho de versão anterior ainda sem nenhuma resposta passa para a
    // vigente: nada foi coletado nele, então não há o que preservar.
    for (const s of surveys) {
      if (s.status === 'synced' || s.status === 'completed' || s.questionnaireVersion >= current) continue
      const answered = await db.responses.where('surveyLocalId').equals(s.localId).count()
      if (answered > 0) continue
      await db.surveys.update(s.id!, { questionnaireVersion: current })
      s.questionnaireVersion = current
    }
    const keep = versionsToKeep(surveys, current)
    await db.questions.filter((q) => q.version === current || !keep.has(q.version)).delete()
    await db.questions.bulkPut(fetched)
  })
}

/** Maior versão de questionário disponível no cache, ou null se o cache está vazio. */
export async function getCurrentCachedVersion(): Promise<number | null> {
  const last = await db.questions.orderBy('version').last()
  return last?.version ?? null
}

/**
 * Perguntas de UMA versão, em ordem. Do cache; se a versão não está em cache
 * (ex.: rascunho antigo), tenta baixar. Devolve [] quando não há cache nem
 * rede — quem chama deve avisar o usuário, nunca cair em outra versão.
 */
export async function getQuestionsForVersion(version: number): Promise<LocalQuestion[]> {
  const cached = await db.questions.where('version').equals(version).sortBy('sortOrder')
  if (cached.length > 0) return cached
  try {
    const fetched = await apiFetch<LocalQuestion[]>(`/questions?version=${version}`)
    await db.questions.bulkPut(fetched)
    return [...fetched].sort((a, b) => a.sortOrder - b.sortOrder)
  } catch {
    return []
  }
}

interface ApiSettlement {
  id: number
  name: string
  municipality: string
  biome: string
}

export async function syncSettlements(): Promise<void> {
  try {
    const settlements = await apiFetch<ApiSettlement[]>('/settlements')
    await db.settlements.clear()
    await db.settlements.bulkAdd(
      settlements.map(({ id, name, municipality, biome }) => ({ id, name, municipality, biome }))
    )
  } catch {
    // Offline — usa assentamentos em cache
  }
}

export async function getSettlements(): Promise<LocalSettlement[]> {
  await syncSettlements()
  return db.settlements.toArray()
}

/**
 * Remove apenas questionários JÁ SINCRONIZADOS que ficaram órfãos
 * (assentamento removido) ou antigos (> 7 dias). Questionários não
 * sincronizados nunca são apagados automaticamente.
 */
export async function cleanupStaleSurveys(): Promise<number> {
  const validIds = new Set((await db.settlements.toArray()).map((s) => s.id))
  const allSurveys = await db.surveys.toArray()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const toDelete = allSurveys.filter((s) =>
    s.status === 'synced' && (
      (validIds.size > 0 && !validIds.has(s.settlementId)) ||
      (s.syncedAt !== null && s.syncedAt < sevenDaysAgo)
    )
  )

  for (const survey of toDelete) {
    await db.responses.where('surveyLocalId').equals(survey.localId).delete()
    await db.surveys.where('localId').equals(survey.localId).delete()
  }
  return toDelete.length
}

export async function deleteLocalSurvey(localId: string): Promise<void> {
  await db.responses.where('surveyLocalId').equals(localId).delete()
  await db.surveys.where('localId').equals(localId).delete()
}

export type SyncStatus =
  | { kind: 'nothing-pending' }
  | { kind: 'auth-expired' }
  | { kind: 'error' }
  | { kind: 'done'; syncedCount: number; failedCount: number }

let inFlight: Promise<SyncStatus> | null = null

/** Single-flight: chamadas concorrentes compartilham a mesma requisição. */
export function syncCompletedSurveys(): Promise<SyncStatus> {
  if (!inFlight) {
    inFlight = doSync().finally(() => { inFlight = null })
  }
  return inFlight
}

async function doSync(): Promise<SyncStatus> {
  const pending = await db.surveys.where('status').equals('completed').toArray()
  if (pending.length === 0) return { kind: 'nothing-pending' }

  const responsesByLocalId = new Map<string, LocalResponse[]>()
  for (const s of pending) {
    responsesByLocalId.set(s.localId, await db.responses.where('surveyLocalId').equals(s.localId).toArray())
  }

  const payload = buildSyncPayload(pending, responsesByLocalId, navigator.userAgent, new Date().toISOString())

  let result: SyncResult
  try {
    result = await apiFetch<SyncResult>('/sync', { method: 'POST', body: JSON.stringify(payload) })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { kind: 'auth-expired' }
    return { kind: 'error' }
  }

  const outcome = resolveSyncOutcome(pending.map((s) => s.localId), result)
  const now = new Date().toISOString()
  for (const localId of outcome.syncedLocalIds) {
    await db.surveys.where('localId').equals(localId).modify({
      status: 'synced' as const,
      syncedAt: now,
    })
  }
  return { kind: 'done', syncedCount: outcome.syncedLocalIds.length, failedCount: outcome.failedLocalIds.length }
}
