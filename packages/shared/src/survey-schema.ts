export type QuestionType = 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'

export type SurveySection = 'socioeconomic' | 'behavioral' | 'environmental'

export interface QuestionOption {
  value: string
  label: string
  hasTextInput?: boolean
}

export interface ConditionalRule {
  dependsOn: string
  showWhen: string[]
}

export interface Question {
  key: string
  number: number
  text: string
  type: QuestionType
  options?: QuestionOption[]
  scaleMin?: number
  scaleMax?: number
  conditional?: ConditionalRule
  section: SurveySection
}

export type SurveyStatus = 'draft' | 'in_progress' | 'completed' | 'synced'

export interface SurveyMetadata {
  id: string
  settlementId: string
  interviewerId: string
  lotNumber: string
  gpsLat: number | null
  gpsLng: number | null
  status: SurveyStatus
  createdAt: string
  updatedAt: string
  completedAt: string | null
  syncedAt: string | null
  deviceInfo: string
}

export interface SurveyResponse {
  questionKey: string
  value: string | string[] | number
  textValue?: string
  answeredAt: string
}
