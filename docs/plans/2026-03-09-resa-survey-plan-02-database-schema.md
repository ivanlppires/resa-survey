# RESA Survey - Plan 02: Database Schema with Drizzle ORM

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Drizzle ORM with PostgreSQL, define the database schema (users, settlements, surveys, responses, questions), run migrations, and seed the 68 questions from the questionnaire.

**Architecture:** Drizzle ORM with postgres.js driver in the server package. Schema files define tables with full type safety. drizzle-kit generates SQL migrations. Questions are stored in the DB (not hardcoded) to support admin CRUD. The shared package exports Drizzle-inferred types for use by both server and web.

**Tech Stack:** Drizzle ORM, drizzle-kit, postgres.js, PostgreSQL 14, dotenv

---

## Task 1: Install Drizzle dependencies

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/.env.example`
- Create: `apps/server/.env`

**Step 1: Install drizzle-orm, postgres.js, dotenv, and drizzle-kit**

Run:
```bash
cd apps/server && npm install drizzle-orm postgres dotenv && npm install -D drizzle-kit
```

**Step 2: Create apps/server/.env.example**

```
DATABASE_URL=postgresql://resa:PASSWORD@localhost:5432/resa_survey
```

**Step 3: Create apps/server/.env**

```
DATABASE_URL=postgresql://resa:PASSWORD@localhost:5432/resa_survey
```

Replace `PASSWORD` with the actual password for the `resa` PostgreSQL user. For local dev, use localhost. For the VPS, the server runs on the same machine as PostgreSQL.

**Step 4: Verify .env is gitignored**

Check that `.gitignore` at root already has `.env` and `.env.*` entries. It does (from Plan 01).

**Step 5: Commit**

```bash
git add apps/server/package.json apps/server/.env.example package-lock.json
git commit -m "feat: add drizzle-orm, postgres.js, and drizzle-kit dependencies"
```

---

## Task 2: Create Drizzle config and database connection

**Files:**
- Create: `apps/server/drizzle.config.ts`
- Create: `apps/server/src/db/index.ts`

**Step 1: Create apps/server/drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

**Step 2: Create apps/server/src/db/index.ts**

```typescript
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const queryClient = postgres(process.env.DATABASE_URL!)
export const db = drizzle({ client: queryClient, schema })
```

**Step 3: Commit**

```bash
git add apps/server/drizzle.config.ts apps/server/src/db/index.ts
git commit -m "feat: add drizzle config and database connection"
```

---

## Task 3: Define schema — users table

**Files:**
- Create: `apps/server/src/db/schema.ts`

**Step 1: Create apps/server/src/db/schema.ts with users table**

```typescript
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
}))

export const settlementsRelations = relations(settlements, ({ many }) => ({
  surveys: many(surveys),
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/server/src/db/schema.ts
git commit -m "feat: define database schema with drizzle-orm (users, settlements, questions, surveys, responses, sync_log)"
```

---

## Task 4: Generate and run the initial migration

**Step 1: Generate migration**

Run:
```bash
cd apps/server && npx drizzle-kit generate
```
Expected: Creates `apps/server/drizzle/XXXX_*.sql` migration file with CREATE TABLE statements for all 6 tables + enums.

**Step 2: Inspect the generated SQL**

Read the generated `.sql` file in `apps/server/drizzle/` and confirm it contains:
- 4 CREATE TYPE statements (user_role, survey_status, question_type, survey_section)
- 6 CREATE TABLE statements (users, settlements, questions, surveys, responses, sync_log)
- Foreign key constraints on surveys, responses, sync_log
- Unique constraint on users.email and questions.key

**Step 3: Run migration against the database**

Run:
```bash
cd apps/server && npx drizzle-kit push
```
Expected: Tables created in the `resa_survey` database. Output shows success.

**Step 4: Verify tables exist**

Run:
```bash
PGPASSWORD=<password> psql -h localhost -U resa -d resa_survey -c "\dt"
```
Expected: Lists all 6 tables.

**Step 5: Commit the migration files**

```bash
git add apps/server/drizzle/
git commit -m "feat: add initial database migration (6 tables)"
```

---

## Task 5: Create seed script with all 68 questions

**Files:**
- Create: `apps/server/src/db/seed.ts`

**Step 1: Create apps/server/src/db/seed.ts**

This script inserts all 68 questions from `questionario.txt` into the `questions` table. Each question has: key, number, text, type, section, options (when applicable), scale range (for Q68), conditionals (for Q20, Q52, Q56, Q67), and sort_order.

```typescript
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { questions } from './schema.js'

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle({ client })

const questionData: (typeof questions.$inferInsert)[] = [
  // ── Parte I: Perfil Socioeconômico (1-24) ──────────────

  {
    key: 'q01_idade',
    number: 1,
    text: 'Idade',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: '18_20', label: '18 a 20 anos' },
      { value: '21_30', label: '21 a 30 anos' },
      { value: '31_40', label: '31 a 40 anos' },
      { value: '41_50', label: '41 a 50 anos' },
      { value: '51_60', label: '51 a 60 anos' },
      { value: 'above_60', label: 'Acima de 60 anos' },
    ],
    sortOrder: 1,
  },
  {
    key: 'q02_escolaridade',
    number: 2,
    text: 'Escolaridade',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'fund_incompleto', label: 'Ensino Fundamental Incompleto' },
      { value: 'fund_completo', label: 'Ensino Fundamental Completo' },
      { value: 'medio_incompleto', label: 'Ensino Médio Incompleto' },
      { value: 'medio_completo', label: 'Ensino Médio Completo' },
      { value: 'superior_incompleto', label: 'Ensino Superior Incompleto' },
      { value: 'superior_completo', label: 'Ensino Superior Completo' },
      { value: 'especializacao', label: 'Especialização' },
      { value: 'curso_tecnico', label: 'Curso Técnico', hasTextInput: true },
    ],
    sortOrder: 2,
  },
  {
    key: 'q03_pessoas_residem',
    number: 3,
    text: 'Quantas pessoas residem na propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: '1_2', label: '01 a 02' },
      { value: '3_4', label: '03 a 04' },
      { value: '5_6', label: '05 a 06' },
      { value: '7_8', label: '07 a 08' },
      { value: 'above_8', label: 'Acima de 08' },
    ],
    sortOrder: 3,
  },
  {
    key: 'q04_pessoas_trabalham',
    number: 4,
    text: 'Quantas dessas pessoas trabalham na propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: '1_2', label: '01 a 02' },
      { value: '3_4', label: '03 a 04' },
      { value: '5_6', label: '05 a 06' },
      { value: '7_8', label: '07 a 08' },
      { value: 'above_8', label: 'Acima de 08' },
    ],
    sortOrder: 4,
  },
  {
    key: 'q05_renda_bruta',
    number: 5,
    text: 'Qual é a renda bruta mensal média gerada pelas atividades da propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: '0_3_sm', label: 'Entre 0 a 3 salários mínimos' },
      { value: '3_6_sm', label: 'Entre 3 a 6 salários mínimos' },
      { value: '6_9_sm', label: 'Entre 6 a 9 salários mínimos' },
      { value: '9_12_sm', label: 'Entre 9 a 12 salários mínimos' },
      { value: 'above_12_sm', label: 'Acima de 12 salários mínimos' },
    ],
    sortOrder: 5,
  },
  {
    key: 'q06_renda_apenas_propriedade',
    number: 6,
    text: 'Toda a renda da família vem apenas da propriedade?',
    type: 'yes_no',
    section: 'socioeconomic',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não', hasTextInput: true },
    ],
    sortOrder: 6,
  },
  {
    key: 'q07_mao_de_obra',
    number: 7,
    text: 'Quanto à mão de obra na propriedade, ela é?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'familiar', label: 'Totalmente Familiar' },
      { value: 'parceria', label: 'Parceria' },
      { value: 'terceirizada_familiar', label: 'Terceirizada e Familiar' },
      { value: 'parcialmente_contratada', label: 'Parcialmente Contratada' },
      { value: 'totalmente_contratada', label: 'Totalmente Contratada' },
    ],
    sortOrder: 7,
  },
  {
    key: 'q08_atividades_economicas',
    number: 8,
    text: 'Quais as principais atividades econômicas desenvolvidas na propriedade?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'pecuaria_corte', label: 'Pecuária de Corte' },
      { value: 'pecuaria_leiteira', label: 'Pecuária Leiteira' },
      { value: 'agricultura', label: 'Agricultura' },
      { value: 'nenhuma', label: 'Nenhuma' },
    ],
    sortOrder: 8,
  },
  {
    key: 'q09_produtos_consumo',
    number: 9,
    text: 'Quais produtos são produzidos para consumo da família?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'mandioca', label: 'Mandioca' },
      { value: 'hortalicas', label: 'Hortaliças' },
      { value: 'frango', label: 'Frango' },
      { value: 'porco', label: 'Porco' },
      { value: 'gado', label: 'Gado' },
      { value: 'leite_derivados', label: 'Leite e derivados' },
      { value: 'outros', label: 'Outros', hasTextInput: true },
    ],
    sortOrder: 9,
  },
  {
    key: 'q10_produtos_comercializacao',
    number: 10,
    text: 'Quais produtos são produzidos para comercialização?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'mandioca', label: 'Mandioca' },
      { value: 'alface', label: 'Alface' },
      { value: 'rucula', label: 'Rúcula' },
      { value: 'abobora', label: 'Abóbora' },
      { value: 'pepino', label: 'Pepino' },
      { value: 'couve', label: 'Couve' },
      { value: 'feijao', label: 'Feijão' },
      { value: 'tomate', label: 'Tomate' },
      { value: 'repolho', label: 'Repolho' },
      { value: 'frango', label: 'Frango' },
      { value: 'porco', label: 'Porco' },
      { value: 'gado', label: 'Gado' },
      { value: 'leite_derivados', label: 'Leite e derivados' },
      { value: 'queijo', label: 'Queijo' },
      { value: 'requeijao', label: 'Requeijão' },
      { value: 'outros', label: 'Outros', hasTextInput: true },
    ],
    sortOrder: 10,
  },
  {
    key: 'q11_hectares_producao',
    number: 11,
    text: 'Quantos hectares da propriedade são utilizados para produção?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'ate_5', label: 'Até 5 hectares' },
      { value: '6_10', label: '6 a 10 hectares' },
      { value: '11_20', label: '11 a 20 hectares' },
      { value: '21_30', label: '21 a 30 hectares' },
      { value: '31_40', label: '31 a 40 hectares' },
      { value: 'above_40', label: 'Acima de 40 hectares', hasTextInput: true },
    ],
    sortOrder: 11,
  },
  {
    key: 'q12_planejamento_atividade',
    number: 12,
    text: 'Como planeja a atividade econômica de sua propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'experiencia', label: 'Planeja as atividades com base principalmente na experiência própria' },
      { value: 'plano_trabalho', label: 'Desenvolve plano de trabalho com objetivos, metas e controles definidos' },
      { value: 'pesquisa_mercado', label: 'Desenvolve pesquisa de mercado' },
      { value: 'nenhum', label: 'Não tenho nenhum planejamento das atividades' },
      { value: 'outro', label: 'Outro', hasTextInput: true },
    ],
    sortOrder: 12,
  },
  {
    key: 'q13_controle_custo',
    number: 13,
    text: 'É feito o controle de custo das atividades da propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'frequentemente', label: 'Frequentemente' },
      { value: 'as_vezes', label: 'Às Vezes' },
      { value: 'muito_poucas', label: 'Muito Poucas Vezes' },
      { value: 'raramente', label: 'Raramente' },
    ],
    sortOrder: 13,
  },
  {
    key: 'q14_como_controle_custo',
    number: 14,
    text: 'Caso faça controle de custo, como é realizado?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'memoria', label: 'Tudo é feito na memória (de cabeça)' },
      { value: 'caderno', label: 'Anotações em caderno' },
      { value: 'planilha_papel', label: 'Planilha em papel' },
      { value: 'planilha_eletronica', label: 'Planilha eletrônica' },
      { value: 'sistema', label: 'Algum sistema de informação' },
    ],
    sortOrder: 14,
  },
  {
    key: 'q15_organizacao_financeira',
    number: 15,
    text: 'Como são organizados os recebimentos, pagamentos e vencimentos da propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'memoria', label: 'Tudo é feito na memória (de cabeça)' },
      { value: 'caderno', label: 'Anotações em caderno' },
      { value: 'planilha_papel', label: 'Planilha em papel' },
      { value: 'planilha_eletronica', label: 'Planilha eletrônica' },
      { value: 'sistema', label: 'Algum sistema de informação' },
    ],
    sortOrder: 15,
  },
  {
    key: 'q16_crescimento_produtivo',
    number: 16,
    text: 'Qual foi o crescimento da atividade produtiva em sua propriedade nos últimos 05 anos?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'igual', label: 'Se manteve igual' },
      { value: '1_10', label: 'Crescimento de 01% a 10%' },
      { value: '11_20', label: 'Crescimento de 11% a 20%' },
      { value: '21_30', label: 'Crescimento de 21% a 30%' },
      { value: '31_40', label: 'Crescimento de 31% a 40%' },
      { value: '41_50', label: 'Crescimento de 41% a 50%' },
      { value: 'diminuicao', label: 'Teve diminuição da produção' },
      { value: 'above_50', label: 'Crescimento acima de 50%', hasTextInput: true },
    ],
    sortOrder: 16,
  },
  {
    key: 'q17_administracao',
    number: 17,
    text: 'Quem é responsável pela administração da propriedade?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'somente_eu', label: 'Somente eu' },
      { value: 'eu_familia', label: 'Eu e minha família' },
    ],
    sortOrder: 17,
  },
  {
    key: 'q18_apoio_tecnico',
    number: 18,
    text: 'A propriedade recebe apoio ou orientação técnica de alguma instituição?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'sindicato', label: 'Sindicato dos Produtores Rurais' },
      { value: 'incra', label: 'INCRA' },
      { value: 'sebrae', label: 'SEBRAE' },
      { value: 'banco_brasil', label: 'Banco do Brasil' },
      { value: 'universidades', label: 'Universidades' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 18,
  },
  {
    key: 'q19_programa_governamental',
    number: 19,
    text: 'A propriedade participa de algum programa governamental?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'pronaf', label: 'PRONAF' },
      { value: 'paa', label: 'PAA' },
      { value: 'pnae', label: 'PNAE' },
      { value: 'ater', label: 'Assistência técnica pública (ATER)' },
      { value: 'nao_participa', label: 'Não participa' },
    ],
    sortOrder: 19,
  },
  {
    key: 'q20_financiamento_rural',
    number: 20,
    text: 'Já utilizou financiamento rural?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'nao_mas_gostaria', label: 'Não, mas gostaria' },
    ],
    sortOrder: 20,
  },
  {
    key: 'q20b_finalidade_financiamento',
    number: 20,
    text: 'Em caso afirmativo, para qual finalidade?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'custeio', label: 'Custeio' },
      { value: 'investimento', label: 'Investimento' },
      { value: 'infraestrutura', label: 'Infraestrutura' },
    ],
    conditional: { dependsOn: 'q20_financiamento_rural', showWhen: ['sim'] },
    sortOrder: 21,
  },
  {
    key: 'q21_tecnologia',
    number: 21,
    text: 'A propriedade utiliza algum tipo de pacote de tecnologia?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'maquinas', label: 'Máquinas agrícolas' },
      { value: 'irrigacao', label: 'Irrigação' },
      { value: 'aplicativos', label: 'Aplicativos ou sistemas de gestão' },
      { value: 'nenhuma', label: 'Nenhuma' },
    ],
    sortOrder: 22,
  },
  {
    key: 'q22_continuar_rural',
    number: 22,
    text: 'Pretende continuar na atividade rural nos próximos anos?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'nao_sabe', label: 'Não sabe' },
    ],
    sortOrder: 23,
  },
  {
    key: 'q23_jovens_interesse',
    number: 23,
    text: 'Os jovens membros da família têm interesse em continuar as atividades rurais?',
    type: 'single_choice',
    section: 'socioeconomic',
    options: [
      { value: 'sim_todos', label: 'Sim, todos' },
      { value: 'alguns', label: 'Alguns' },
      { value: 'nenhum', label: 'Nenhum' },
      { value: 'nao_aplicavel', label: 'Não aplicável' },
      { value: 'sem_resposta', label: 'Sem resposta' },
    ],
    sortOrder: 24,
  },
  {
    key: 'q24_dificuldades',
    number: 24,
    text: 'Quais são as maiores dificuldades enfrentadas?',
    type: 'multiple_choice',
    section: 'socioeconomic',
    options: [
      { value: 'falta_credito', label: 'Falta de crédito' },
      { value: 'precos_baixos', label: 'Preços baixos' },
      { value: 'clima', label: 'Clima' },
      { value: 'mao_de_obra', label: 'Mão de obra' },
      { value: 'falta_assistencia', label: 'Falta de assistência técnica' },
    ],
    sortOrder: 25,
  },

  // ── Parte II: Perfil Comportamental (25-51) ─────────────

  {
    key: 'q25_busca_informacoes',
    number: 25,
    text: 'Antes de tomar decisões importantes, você costuma buscar informações?',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'sempre', label: 'Sempre' },
      { value: 'as_vezes', label: 'Às vezes' },
      { value: 'raramente', label: 'Raramente' },
      { value: 'nunca', label: 'Nunca' },
    ],
    sortOrder: 26,
  },
  {
    key: 'q26_fonte_informacoes',
    number: 26,
    text: 'As informações que mais influenciam suas decisões vêm de:',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'experiencia', label: 'Experiência própria' },
      { value: 'familia', label: 'Família' },
      { value: 'outros_produtores', label: 'Outros produtores' },
      { value: 'tecnicos', label: 'Técnicos/assistência técnica' },
      { value: 'midia', label: 'Internet, rádio ou TV' },
    ],
    sortOrder: 27,
  },
  {
    key: 'q27_capacidade_decisao',
    number: 27,
    text: 'Como você avalia sua capacidade de tomar boas decisões para a propriedade?',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'muito_boa', label: 'Muito boa' },
      { value: 'boa', label: 'Boa' },
      { value: 'regular', label: 'Regular' },
      { value: 'ruim', label: 'Ruim' },
    ],
    sortOrder: 28,
  },
  {
    key: 'q28_medo_prejuizo',
    number: 28,
    text: 'Você já deixou de investir ou mudar a produção por medo de prejuízo financeiro?',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'sim_varias', label: 'Sim, várias vezes' },
      { value: 'sim_algumas', label: 'Sim, algumas vezes' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 29,
  },
  {
    key: 'q29_relacao_vizinhos',
    number: 29,
    text: 'No dia a dia da comunidade, como você descreveria a relação entre os vizinhos?',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'a', label: 'Relações muito próximas e de ajuda mútua' },
      { value: 'b', label: 'Relações cordiais, a ajuda acontece apenas em emergências' },
      { value: 'c', label: 'Relações de pouca interação entre vizinhos' },
      { value: 'd', label: 'A comunidade isolada, há pouco contato entre as famílias' },
    ],
    sortOrder: 30,
  },
  {
    key: 'q30_relacao_lote',
    number: 30,
    text: 'Qual sentimento melhor representa a sua relação com o lote onde você vive?',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'a', label: 'É meu lugar no mundo, onde criei minha família e pretendo ficar. O trabalho na terra é duro, mas me dá satisfação e liberdade.' },
      { value: 'b', label: 'É uma conquista, mas a vida aqui é muito difícil e, se surgir uma oportunidade melhor na cidade, penso em sair.' },
      { value: 'c', label: 'Gosto da tranquilidade do lugar, mas o trabalho agrícola é apenas um meio de sobrevivência, não uma escolha de vida.' },
      { value: 'd', label: 'Tenho orgulho de ser agricultor e acredito que o futuro da minha família está aqui, desde que tenhamos mais apoio.' },
    ],
    sortOrder: 31,
  },
  {
    key: 'q31_problema_comunidade',
    number: 31,
    text: 'Quando surge um problema que afeta a comunidade (como falta de água, estrada ou acesso a políticas públicas), qual é a atitude mais comum dos moradores?',
    type: 'single_choice',
    section: 'behavioral',
    options: [
      { value: 'a', label: 'Cada família resolve individualmente, sem envolver a vizinhança' },
      { value: 'b', label: 'Um grupo de lideranças conhecidas se reúne e decide pelos demais' },
      { value: 'c', label: 'A comunidade se mobiliza, convoca uma reunião aberta e busca uma solução coletiva' },
      { value: 'd', label: 'Ficamos na expectativa de que o poder público resolva a situação' },
    ],
    sortOrder: 32,
  },
  {
    key: 'q32_ganho_menor_garantido',
    number: 32,
    text: 'Prefere um ganho menor, mas garantido?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 33,
  },
  {
    key: 'q33_investe_certeza',
    number: 33,
    text: 'Só investe quando tem quase certeza que dará certo?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 34,
  },
  {
    key: 'q34_prefere_nao_ganhar',
    number: 34,
    text: 'Prefere não ganhar nada a correr risco de perder?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 35,
  },
  {
    key: 'q35_planeja_mais_um_ano',
    number: 35,
    text: 'Planeja a produção para mais de um ano?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 36,
  },
  {
    key: 'q36_reserva_financeira',
    number: 36,
    text: 'Faz reserva financeira para anos ruins?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 37,
  },
  {
    key: 'q37_manter_plantio',
    number: 37,
    text: 'Prefere manter o que sempre plantou?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 38,
  },
  {
    key: 'q38_desconfia_tecnicas',
    number: 38,
    text: 'Desconfia de técnicas novas?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 39,
  },
  {
    key: 'q39_observa_vizinhos',
    number: 39,
    text: 'Observa o que os vizinhos fazem antes de decidir?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 40,
  },
  {
    key: 'q40_conversa_produtores',
    number: 40,
    text: 'Conversa com outros produtores antes de investir?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 41,
  },
  {
    key: 'q41_previsao_tempo',
    number: 41,
    text: 'Quando a previsão do tempo é incerta, prefere não arriscar plantio novo?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 42,
  },
  {
    key: 'q42_medo_seca_chuva',
    number: 42,
    text: 'Já deixou de plantar algo por medo de seca ou excesso de chuva?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 43,
  },
  {
    key: 'q43_reduz_plantio',
    number: 43,
    text: 'Se o ano anterior foi ruim, reduz o plantio no ano seguinte?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 44,
  },
  {
    key: 'q44_confia_experiencia',
    number: 44,
    text: 'Confia mais na própria experiência do que em orientação técnica?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 45,
  },
  {
    key: 'q45_evita_emprestimo',
    number: 45,
    text: 'Evita empréstimo mesmo quando poderia melhorar a produção?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 46,
  },
  {
    key: 'q46_divida_preocupacao',
    number: 46,
    text: 'Ter dívida causa preocupação e atrapalha decisões do dia a dia?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 47,
  },
  {
    key: 'q47_medo_diversificar',
    number: 47,
    text: 'Já deixou de diversificar por medo de errar?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 48,
  },
  {
    key: 'q48_depender_uma_cultura',
    number: 48,
    text: 'Acredita que depender de uma só cultura é arriscado?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 49,
  },
  {
    key: 'q49_anota_gastos',
    number: 49,
    text: 'Anota gastos e lucros da produção?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 50,
  },
  {
    key: 'q50_compara_precos',
    number: 50,
    text: 'Compara preços antes de vender?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 51,
  },
  {
    key: 'q51_insiste_prejuizo',
    number: 51,
    text: 'Se uma cultura começa a dar prejuízo, insiste antes de abandonar?',
    type: 'yes_no',
    section: 'behavioral',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 52,
  },

  // ── Parte III: Perfil Ambiental (52-68) ─────────────────

  {
    key: 'q52_irrigacao',
    number: 52,
    text: 'Você possui algum sistema de irrigação para produção agrícola?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 53,
  },
  {
    key: 'q52b_tipo_irrigacao',
    number: 52,
    text: 'Se sim, qual tipo de irrigação é utilizada?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'gotejamento', label: 'Gotejamento' },
      { value: 'aspersao', label: 'Aspersão' },
      { value: 'sulco', label: 'Sulco' },
      { value: 'manual', label: 'Manual' },
      { value: 'outro', label: 'Outro', hasTextInput: true },
    ],
    conditional: { dependsOn: 'q52_irrigacao', showWhen: ['sim'] },
    sortOrder: 54,
  },
  {
    key: 'q53_fonte_agua',
    number: 53,
    text: 'Qual é a fonte de água usada para irrigação?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'poco', label: 'Poço' },
      { value: 'nascente_rio', label: 'Nascente ou rio' },
      { value: 'cisterna', label: 'Cisterna' },
      { value: 'sistema_comunitario', label: 'Sistema comunitário' },
      { value: 'outro', label: 'Outro', hasTextInput: true },
    ],
    sortOrder: 55,
  },
  {
    key: 'q54_uso_agua',
    number: 54,
    text: 'Considera que o uso da água na propriedade é',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'suficiente', label: 'Suficiente' },
      { value: 'insuficiente', label: 'Insuficiente' },
    ],
    sortOrder: 56,
  },
  {
    key: 'q55_agrotoxicos',
    number: 55,
    text: 'Utiliza agrotóxicos ou defensivos agrícolas?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 57,
  },
  {
    key: 'q56_descarte_agrotoxicos',
    number: 56,
    text: 'Caso utilize, realiza o descarte correto das embalagens?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'as_vezes', label: 'Às vezes' },
    ],
    conditional: { dependsOn: 'q55_agrotoxicos', showWhen: ['sim'] },
    sortOrder: 58,
  },
  {
    key: 'q57_adubacao_organica',
    number: 57,
    text: 'Utiliza adubação orgânica (esterco, compostagem)?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'parcialmente', label: 'Parcialmente' },
    ],
    sortOrder: 59,
  },
  {
    key: 'q58_descarte_embalagens',
    number: 58,
    text: 'Caso utilize, faz o descarte correto das embalagens?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'as_vezes', label: 'Às vezes' },
    ],
    sortOrder: 60,
  },
  {
    key: 'q59_adubo_organico',
    number: 59,
    text: 'Utiliza adubo orgânico (esterco, compostagem)?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 61,
  },
  {
    key: 'q60_recursos_floresta',
    number: 60,
    text: 'A família utiliza recursos naturais da floresta?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 62,
  },
  {
    key: 'q61_eventos_climaticos',
    number: 61,
    text: 'Sua produção foi afetada por eventos climáticos extremos nos últimos 5 anos?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 63,
  },
  {
    key: 'q62_conservacao_solo',
    number: 62,
    text: 'Utiliza práticas de conservação do solo?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 64,
  },
  {
    key: 'q63_rotacao_culturas',
    number: 63,
    text: 'Realiza rotação de culturas?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'as_vezes', label: 'Às vezes' },
    ],
    sortOrder: 65,
  },
  {
    key: 'q64_preservacao_ambiental',
    number: 64,
    text: 'Existe área de preservação ambiental no lote (mata ciliar, reserva legal, nascente protegida)?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'nao_sabe', label: 'Não sabe informar' },
    ],
    sortOrder: 66,
  },
  {
    key: 'q65_plantio_arvores',
    number: 65,
    text: 'Já realizou plantio de árvores ou recuperação de áreas degradadas?',
    type: 'yes_no',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ],
    sortOrder: 67,
  },
  {
    key: 'q66_problemas_ambientais',
    number: 66,
    text: 'Já observou problemas ambientais na propriedade?',
    type: 'multiple_choice',
    section: 'environmental',
    options: [
      { value: 'erosao', label: 'Erosão' },
      { value: 'queimadas', label: 'Queimadas' },
      { value: 'desmatamento', label: 'Desmatamento' },
      { value: 'assoreamento', label: 'Assoreamento' },
      { value: 'nao_observa', label: 'Não observa problemas' },
      { value: 'outros', label: 'Outros', hasTextInput: true },
    ],
    sortOrder: 68,
  },
  {
    key: 'q67_praticas_sustentaveis',
    number: 67,
    text: 'Considera importante adotar práticas mais sustentáveis na produção?',
    type: 'single_choice',
    section: 'environmental',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'ja_adota', label: 'Já adota práticas sustentáveis', hasTextInput: true },
    ],
    sortOrder: 69,
  },
  {
    key: 'q68_percepcao_clima',
    number: 68,
    text: 'Em uma escala de 1 a 5, o quanto você percebe que o clima mudou nos últimos 10 anos?',
    type: 'scale',
    section: 'environmental',
    scaleMin: 1,
    scaleMax: 5,
    sortOrder: 70,
  },
]

async function seed() {
  console.log('Seeding questions...')

  // Clear existing questions
  await db.delete(questions)

  // Insert all questions
  await db.insert(questions).values(questionData)

  console.log(`Inserted ${questionData.length} questions.`)

  await client.end()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
```

**Step 2: Run the seed script**

Run:
```bash
cd apps/server && npx tsx src/db/seed.ts
```
Expected: "Inserted 70 questions." (68 original + 2 conditional sub-questions: q20b, q52b)

**Step 3: Verify questions exist in the database**

Run:
```bash
PGPASSWORD=<password> psql -h localhost -U resa -d resa_survey -c "SELECT count(*) FROM questions;"
```
Expected: `70`

Run:
```bash
PGPASSWORD=<password> psql -h localhost -U resa -d resa_survey -c "SELECT key, number, section FROM questions ORDER BY sort_order LIMIT 5;"
```
Expected: First 5 questions with correct keys and sections.

**Step 4: Commit**

```bash
git add apps/server/src/db/seed.ts
git commit -m "feat: add seed script with all 68 questionnaire questions"
```

---

## Task 6: Export inferred types from schema to shared package

**Files:**
- Modify: `packages/shared/src/survey-schema.ts`
- Modify: `apps/server/package.json` (add seed script)

**Step 1: Add seed script to apps/server/package.json**

Add to `"scripts"`:
```json
"db:seed": "tsx src/db/seed.ts",
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

**Step 2: Update packages/shared/src/survey-schema.ts — add DB-aligned types**

Keep the existing types (they're used by the web app for offline logic) but add the new DB-facing types at the bottom:

```typescript
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
}
```

**Step 3: Build shared package**

Run: `npx turbo build --filter=@resa/shared`
Expected: Builds successfully.

**Step 4: Commit**

```bash
git add packages/shared/src/survey-schema.ts apps/server/package.json
git commit -m "feat: add DB-aligned types to shared package and db scripts to server"
```

---

## Task 7: Verify full integration — health endpoint with DB check

**Files:**
- Modify: `apps/server/src/routes/health.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Update health route to include a DB ping**

```typescript
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import { sql } from 'drizzle-orm'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    const result = await db.execute(sql`SELECT 1 as ok`)
    return { status: 'ok', db: result.length > 0 ? 'connected' : 'error' }
  })
}
```

**Step 2: Add dotenv import at server entry point**

Add `import 'dotenv/config'` as the first line of `apps/server/src/index.ts` (before any other imports).

**Step 3: Verify the server starts and the health endpoint returns DB status**

Run:
```bash
cd apps/server && npx tsx src/index.ts &
sleep 2
curl http://localhost:3000/api/health
```
Expected: `{"status":"ok","db":"connected"}`

Kill the background process.

**Step 4: Build everything**

Run: `npx turbo build`
Expected: All 3 packages build successfully.

**Step 5: Commit**

```bash
git add apps/server/src/routes/health.ts apps/server/src/index.ts
git commit -m "feat: add database connectivity check to health endpoint"
```

---

## Summary

After completing this plan:

```
apps/server/
├── drizzle/                    # Migration files (SQL)
├── drizzle.config.ts           # Drizzle Kit config
├── .env                        # Database URL (gitignored)
├── .env.example                # Template
└── src/
    ├── db/
    │   ├── index.ts            # DB connection (drizzle + postgres.js)
    │   ├── schema.ts           # All table definitions + relations
    │   └── seed.ts             # Seeds 70 questions from questionnaire
    ├── routes/
    │   └── health.ts           # Health endpoint with DB check
    └── index.ts                # Entry point (with dotenv)
```

Tables created in PostgreSQL:
- `users` — admin/interviewer/viewer accounts
- `settlements` — rural settlements with GeoJSON
- `questions` — 70 questions (68 + 2 conditional sub-questions) with CRUD support
- `surveys` — individual survey sessions
- `responses` — JSONB answers per question
- `sync_log` — sync audit trail

**Next plan:** Plan 03 will cover the REST API routes (auth, surveys CRUD, questions CRUD for admin, sync endpoint).
