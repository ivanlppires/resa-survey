import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, asc, inArray, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { surveys, responses, settlements, users, questions } from '../db/schema.js'
import { buildCsv, buildTable, type CsvQuestion, type CsvSurveyRow } from '../lib/csv.js'
import { buildXlsx } from '../lib/xlsx.js'

const exportQuery = z.object({
  settlementId: z.coerce.number().optional(),
  surveyId: z.coerce.number().optional(),
})

/** Coleta as perguntas e as linhas de entrevistas para o export, aplicando o filtro. */
async function gatherExport(query: z.infer<typeof exportQuery>): Promise<{ csvQuestions: CsvQuestion[]; rows: CsvSurveyRow[] }> {
  const questionRows = await db.select().from(questions).orderBy(asc(questions.sortOrder))
  const csvQuestions: CsvQuestion[] = questionRows.map((q) => ({
    key: q.key,
    sortOrder: q.sortOrder,
    hasTextOption: (q.options ?? []).some((o) => !!o.hasTextInput),
  }))

  // surveyId (uma entrevista) exporta aquele registro independentemente do status;
  // caso contrário, apenas sincronizados (opcionalmente por assentamento).
  let where: SQL | undefined
  if (query.surveyId) {
    where = eq(surveys.id, query.surveyId)
  } else if (query.settlementId) {
    where = and(eq(surveys.status, 'synced'), eq(surveys.settlementId, query.settlementId))
  } else {
    where = eq(surveys.status, 'synced')
  }

  const surveyRows = await db.select({
    id: surveys.id,
    clientId: surveys.clientId,
    lotNumber: surveys.lotNumber,
    gpsLat: surveys.gpsLat,
    gpsLng: surveys.gpsLng,
    createdAt: surveys.createdAt,
    completedAt: surveys.completedAt,
    syncedAt: surveys.syncedAt,
    settlementName: settlements.name,
    municipality: settlements.municipality,
    biome: settlements.biome,
    interviewerName: users.name,
    interviewerEmail: users.email,
  }).from(surveys)
    .innerJoin(settlements, eq(surveys.settlementId, settlements.id))
    .innerJoin(users, eq(surveys.interviewerId, users.id))
    .where(where)
    .orderBy(asc(surveys.id))

  const allResponses = surveyRows.length > 0
    ? await db.select().from(responses).where(inArray(responses.surveyId, surveyRows.map((s) => s.id)))
    : []
  const bySurvey = new Map<number, Map<string, { value: unknown; textValue: string | null }>>()
  for (const r of allResponses) {
    let m = bySurvey.get(r.surveyId)
    if (!m) { m = new Map(); bySurvey.set(r.surveyId, m) }
    m.set(r.questionKey, { value: r.value, textValue: r.textValue })
  }

  const rows: CsvSurveyRow[] = surveyRows.map((s) => ({
    id: s.id,
    clientId: s.clientId,
    settlementName: s.settlementName,
    municipality: s.municipality,
    biome: s.biome,
    interviewerName: s.interviewerName,
    interviewerEmail: s.interviewerEmail,
    lotNumber: s.lotNumber,
    gpsLat: s.gpsLat,
    gpsLng: s.gpsLng,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    syncedAt: s.syncedAt?.toISOString() ?? null,
    responses: bySurvey.get(s.id) ?? new Map(),
  }))

  return { csvQuestions, rows }
}

function filenameBase(query: z.infer<typeof exportQuery>): string {
  const today = new Date().toISOString().slice(0, 10)
  return query.surveyId ? `resa-entrevista-${query.surveyId}-${today}` : `resa-survey-${today}`
}

export async function exportRoutes(app: FastifyInstance) {
  app.get('/api/admin/export.csv', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const query = exportQuery.parse(request.query)
    const { csvQuestions, rows } = await gatherExport(query)
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filenameBase(query)}.csv"`)
    return buildCsv(csvQuestions, rows)
  })

  app.get('/api/admin/export.xlsx', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const query = exportQuery.parse(request.query)
    const { csvQuestions, rows } = await gatherExport(query)
    const { header, matrix } = buildTable(csvQuestions, rows)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="${filenameBase(query)}.xlsx"`)
    return buildXlsx(header, matrix)
  })
}
