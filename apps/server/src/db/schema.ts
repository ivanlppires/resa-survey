import { pgTable, pgEnum, serial, text, timestamp, integer, jsonb, boolean, varchar, doublePrecision } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ──────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'interviewer', 'viewer'])
export const surveyStatusEnum = pgEnum('survey_status', ['draft', 'in_progress', 'completed', 'synced'])
export const questionTypeEnum = pgEnum('question_type', ['single_choice', 'multiple_choice', 'yes_no', 'scale', 'text'])
export const surveySectionEnum = pgEnum('survey_section', ['socioeconomic', 'behavioral', 'environmental'])

// ── Users ──────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('interviewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Settlements ────────────────────────────────────────

export const settlements = pgTable('settlements', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  municipality: text('municipality').notNull(),
  biome: text('biome').notNull(),
  geojson: jsonb('geojson'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Questions ──────────────────────────────────────────

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 50 }).notNull().unique(),
  number: integer('number').notNull(),
  text: text('text').notNull(),
  type: questionTypeEnum('type').notNull(),
  section: surveySectionEnum('section').notNull(),
  options: jsonb('options').$type<{ value: string; label: string; hasTextInput?: boolean }[]>(),
  scaleMin: integer('scale_min'),
  scaleMax: integer('scale_max'),
  conditional: jsonb('conditional').$type<{ dependsOn: string; showWhen: string[] }>(),
  sortOrder: integer('sort_order').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── User ↔ Settlement (many-to-many) ──────────────────

export const userSettlements = pgTable('user_settlements', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  settlementId: integer('settlement_id').notNull().references(() => settlements.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Surveys ────────────────────────────────────────────

export const surveys = pgTable('surveys', {
  id: serial('id').primaryKey(),
  settlementId: integer('settlement_id').notNull().references(() => settlements.id),
  interviewerId: integer('interviewer_id').notNull().references(() => users.id),
  lotNumber: text('lot_number'),
  gpsLat: doublePrecision('gps_lat'),
  gpsLng: doublePrecision('gps_lng'),
  status: surveyStatusEnum('status').notNull().default('draft'),
  deviceInfo: text('device_info'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
})

// ── Responses ──────────────────────────────────────────

export const responses = pgTable('responses', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  questionKey: varchar('question_key', { length: 50 }).notNull(),
  value: jsonb('value').notNull(),
  answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Sync Log ───────────────────────────────────────────

export const syncLog = pgTable('sync_log', {
  id: serial('id').primaryKey(),
  surveyId: integer('survey_id').notNull().references(() => surveys.id),
  deviceInfo: text('device_info'),
  payloadHash: text('payload_hash'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Relations ──────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  surveys: many(surveys),
  userSettlements: many(userSettlements),
}))

export const settlementsRelations = relations(settlements, ({ many }) => ({
  surveys: many(surveys),
  userSettlements: many(userSettlements),
}))

export const userSettlementsRelations = relations(userSettlements, ({ one }) => ({
  user: one(users, { fields: [userSettlements.userId], references: [users.id] }),
  settlement: one(settlements, { fields: [userSettlements.settlementId], references: [settlements.id] }),
}))

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  settlement: one(settlements, { fields: [surveys.settlementId], references: [settlements.id] }),
  interviewer: one(users, { fields: [surveys.interviewerId], references: [users.id] }),
  responses: many(responses),
  syncLogs: many(syncLog),
}))

export const responsesRelations = relations(responses, ({ one }) => ({
  survey: one(surveys, { fields: [responses.surveyId], references: [surveys.id] }),
}))

export const syncLogRelations = relations(syncLog, ({ one }) => ({
  survey: one(surveys, { fields: [syncLog.surveyId], references: [surveys.id] }),
}))
