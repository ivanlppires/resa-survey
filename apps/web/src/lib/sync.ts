import { db, type LocalQuestion } from './db'
import { apiFetch } from './api'

interface Settlement {
  id: number
  name: string
}

export async function syncQuestions(): Promise<void> {
  try {
    const questions = await apiFetch<LocalQuestion[]>('/questions')
    await db.questions.clear()
    await db.questions.bulkAdd(questions)
  } catch {
    // Offline — use cached questions
  }
}

/** Remove local surveys whose settlement was deleted on the server, and clean up old synced surveys */
export async function cleanupStaleSurveys(): Promise<number> {
  try {
    const settlements = await apiFetch<Settlement[]>('/settlements')
    const validIds = new Set(settlements.map((s) => s.id))

    // Find orphaned surveys (settlement no longer exists)
    const allSurveys = await db.surveys.toArray()
    const orphaned = allSurveys.filter((s) => !validIds.has(s.settlementId))

    // Also clean up synced surveys older than 7 days (already on server)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const oldSynced = allSurveys.filter((s) => s.status === 'synced' && s.syncedAt && s.syncedAt < sevenDaysAgo)

    const toDelete = [...orphaned, ...oldSynced]
    for (const survey of toDelete) {
      await db.responses.where('surveyLocalId').equals(survey.localId).delete()
      await db.surveys.where('localId').equals(survey.localId).delete()
    }

    return toDelete.length
  } catch {
    return 0 // Offline — skip cleanup
  }
}

/** Delete a local survey and its responses */
export async function deleteLocalSurvey(localId: string): Promise<void> {
  await db.responses.where('surveyLocalId').equals(localId).delete()
  await db.surveys.where('localId').equals(localId).delete()
}

export async function getQuestions(): Promise<LocalQuestion[]> {
  let questions = await db.questions.orderBy('sortOrder').toArray()
  if (questions.length === 0) {
    await syncQuestions()
    questions = await db.questions.orderBy('sortOrder').toArray()
  }
  return questions
}

export async function syncCompletedSurveys(): Promise<string[]> {
  const pending = await db.surveys.where('status').equals('completed').toArray()
  if (pending.length === 0) return []

  const token = localStorage.getItem('resa_token')
  if (!token) return []

  const syncedLocalIds: string[] = []

  for (const survey of pending) {
    try {
      const surveyResponses = await db.responses
        .where('surveyLocalId')
        .equals(survey.localId)
        .toArray()

      await apiFetch('/sync', {
        method: 'POST',
        body: JSON.stringify({
          surveys: [{
            metadata: {
              settlementId: survey.settlementId,
              lotNumber: survey.lotNumber,
              gpsLat: survey.gpsLat,
              gpsLng: survey.gpsLng,
              status: survey.status,
              deviceInfo: survey.deviceInfo,
              createdAt: survey.createdAt,
              updatedAt: survey.updatedAt,
              completedAt: survey.completedAt,
            },
            responses: surveyResponses.map((r) => ({
              questionKey: r.questionKey,
              value: r.value,
              answeredAt: r.answeredAt,
            })),
          }],
          deviceInfo: survey.deviceInfo,
          syncedAt: new Date().toISOString(),
        }),
      })

      await db.surveys.where('localId').equals(survey.localId).modify({
        status: 'synced' as const,
        syncedAt: new Date().toISOString(),
      })

      syncedLocalIds.push(survey.localId)
    } catch {
      // Will retry next sync cycle
    }
  }

  return syncedLocalIds
}
