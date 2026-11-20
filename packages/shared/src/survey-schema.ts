export type QuestionType = 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'

export type SurveySection = 'socioeconomic' | 'behavioral' | 'environmental'

export interface QuestionOption {
  value: string
  label: string
  hasTextInput?: boolean
  /** Marcar esta alternativa desmarca as demais (ex.: "Nenhuma"). */
  exclusive?: boolean
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
  /** Versão do questionário a que a pergunta pertence. */
  version: number
  /** Linhas de um mesmo quadro compartilham groupKey/groupText. */
  groupKey: string | null
  groupText: string | null
  subsection: string | null
  maxSelections: number | null
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

// ── DB-facing types (aligned with Drizzle schema) ──────

export type UserRole = 'admin' | 'interviewer' | 'viewer'

export interface UserRecord {
  id: number
  name: string
  email: string
  role: UserRole
  createdAt: string
}

export interface SettlementRecord {
  id: number
  name: string
  municipality: string
  biome: string
  geojson: unknown
  metadata: unknown
  createdAt: string
}

export interface QuestionRecord {
  id: number
  key: string
  number: number
  text: string
  type: QuestionType
  section: SurveySection
  options: QuestionOption[] | null
  scaleMin: number | null
  scaleMax: number | null
  conditional: ConditionalRule | null
  sortOrder: number
  active: boolean
  version: number
  groupKey: string | null
  groupText: string | null
  subsection: string | null
  maxSelections: number | null
}
