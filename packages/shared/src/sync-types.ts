import type { SurveyStatus } from './survey-schema.js'

export interface SyncSurveyMetadata {
  localId: string
  settlementId: number
  lotNumber: string | null
  gpsLat: number | null
  gpsLng: number | null
  status: SurveyStatus
  deviceInfo: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface SyncResponseItem {
  questionKey: string
  value: unknown
  textValue: string | null
  answeredAt: string
}

export interface SyncSurvey {
  metadata: SyncSurveyMetadata
  responses: SyncResponseItem[]
}

export interface SyncPayload {
  surveys: SyncSurvey[]
  deviceInfo: string
  syncedAt: string
}

export interface SyncErrorItem {
  localId: string
  message: string
}

export interface SyncResult {
  syncedLocalIds: string[]
  errors: SyncErrorItem[]
  message?: string
}
