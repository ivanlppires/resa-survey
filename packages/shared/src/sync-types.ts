import type { SurveyMetadata, SurveyResponse } from './survey-schema.js'

export interface SyncPayload {
  surveys: SyncSurvey[]
  deviceInfo: string
  syncedAt: string
}

export interface SyncSurvey {
  metadata: SurveyMetadata
  responses: SurveyResponse[]
}

export interface SyncResult {
  syncedIds: string[]
  errors: SyncError[]
}

export interface SyncError {
  surveyId: string
  message: string
}
