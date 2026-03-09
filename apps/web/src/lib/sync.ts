import { db, type LocalQuestion } from './db'
import { apiFetch } from './api'
import { defaultQuestions } from './defaultQuestions'

export async function syncQuestions(): Promise<void> {
  try {
    const questions = await apiFetch<LocalQuestion[]>('/questions')
    if (questions.length > 0) {
      await db.questions.clear()
      await db.questions.bulkAdd(questions)
    }
  } catch {
    // Offline — use cached or default questions
  }
}

export async function getQuestions(): Promise<LocalQuestion[]> {
  let questions = await db.questions.orderBy('sortOrder').toArray()
  if (questions.length === 0) {
    await syncQuestions()
    questions = await db.questions.orderBy('sortOrder').toArray()
  }
  // If still empty (offline and no cache), use embedded defaults
  if (questions.length === 0) {
    await db.questions.bulkAdd(defaultQuestions)
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
