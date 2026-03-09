import Dexie, { type EntityTable } from 'dexie'

export interface LocalQuestion {
  id: number
  key: string
  number: number
  text: string
  type: 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'
  section: 'socioeconomic' | 'behavioral' | 'environmental'
  options: { value: string; label: string; hasTextInput?: boolean }[] | null
  scaleMin: number | null
  scaleMax: number | null
  conditional: { dependsOn: string; showWhen: string[] } | null
  sortOrder: number
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
}

export interface LocalResponse {
  id?: number
  surveyLocalId: string
  questionKey: string
  value: unknown
  answeredAt: string
}

const db = new Dexie('resa-survey') as Dexie & {
  questions: EntityTable<LocalQuestion, 'id'>
  surveys: EntityTable<LocalSurvey, 'id'>
  responses: EntityTable<LocalResponse, 'id'>
}

db.version(1).stores({
  questions: 'id, key, section, sortOrder',
  surveys: '++id, localId, status, settlementId',
  responses: '++id, surveyLocalId, questionKey, [surveyLocalId+questionKey]',
})

export { db }
