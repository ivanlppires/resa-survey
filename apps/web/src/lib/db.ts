import Dexie, { type EntityTable } from 'dexie'
import { inferSurveyVersion } from './questionnaire'

export interface LocalQuestion {
  id: number
  key: string
  number: number
  text: string
  type: 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'
  section: 'socioeconomic' | 'behavioral' | 'environmental'
  options: { value: string; label: string; hasTextInput?: boolean; exclusive?: boolean }[] | null
  scaleMin: number | null
  scaleMax: number | null
  conditional: { dependsOn: string; showWhen: string[] } | null
  sortOrder: number
  /** Versão do questionário a que a pergunta pertence. */
  version: number
  /** Linhas de um mesmo quadro compartilham groupKey/groupText. */
  groupKey: string | null
  groupText: string | null
  subsection: string | null
  maxSelections: number | null
}

export interface LocalSurvey {
  id?: number
  localId: string
  settlementId: number
  settlementName: string
  lotNumber: string
  gpsLat: number | null
  gpsLng: number | null
  status: 'draft' | 'in_progress' | 'completed' | 'synced'
  deviceInfo: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  syncedAt: string | null
  /** Versão do questionário com que a entrevista foi (ou está sendo) feita. */
  questionnaireVersion: number
}

export interface LocalResponse {
  id?: number
  surveyLocalId: string
  questionKey: string
  value: unknown
  textValue?: string
  answeredAt: string
}

export interface LocalSettlement {
  id: number
  name: string
  municipality: string
  biome: string
}

const db = new Dexie('resa-survey') as Dexie & {
  questions: EntityTable<LocalQuestion, 'id'>
  surveys: EntityTable<LocalSurvey, 'id'>
  responses: EntityTable<LocalResponse, 'id'>
  settlements: EntityTable<LocalSettlement, 'id'>
}

db.version(1).stores({
  questions: 'id, key, section, sortOrder',
  surveys: '++id, localId, status, settlementId',
  responses: '++id, surveyLocalId, questionKey, [surveyLocalId+questionKey]',
})

db.version(2).stores({
  settlements: 'id',
})

// v3: questionário versionado. Perguntas em cache sem `version` são da v1
// (única que existia). Entrevistas locais ganham a versão inferida das suas
// respostas — nenhuma entrevista ou resposta é apagada nesta migração.
db.version(3).stores({
  questions: 'id, key, section, sortOrder, version',
}).upgrade(async (tx) => {
  let cachedVersion = 1
  await tx.table('questions').toCollection().modify((q: { version?: number }) => {
    if (q.version == null) q.version = 1
    cachedVersion = Math.max(cachedVersion, q.version)
  })
  const surveys = await tx.table('surveys').toArray()
  for (const s of surveys) {
    if (s.questionnaireVersion != null) continue
    const keys = (await tx.table('responses').where('surveyLocalId').equals(s.localId).toArray())
      .map((r: { questionKey: string }) => r.questionKey)
    await tx.table('surveys').update(s.id, { questionnaireVersion: inferSurveyVersion(keys, cachedVersion) })
  }
})

export { db }
