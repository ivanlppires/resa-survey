import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, asc, inArray, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { surveys, responses, settlements, users, questions } from '../db/schema.js'
import { buildCsv, buildTable, type CsvQuestion, type CsvSurveyRow } from '../lib/csv.js'
import { getCurrentVersion, resolveExportVersion, toCsvQuestions } from '../lib/questionnaire-version.js'
import { buildXlsx } from '../lib/xlsx.js'
import { buildSurveyReportPdf, type PdfQuestion } from '../lib/pdf-report.js'

const exportQuery = z.object({
  settlementId: z.coerce.number().optional(),
  surveyId: z.coerce.number().optional(),
  version: z.coerce.number().int().positive().optional(),
})

/** Coleta as perguntas e as linhas de entrevistas para o export, aplicando o filtro. */
interface ExportData {
  version: number
  csvQuestions: CsvQuestion[]
  pdfQuestions: PdfQuestion[]
  rows: CsvSurveyRow[]
}

/**
 * Coleta as perguntas e as linhas de entrevistas para o export. Cada export
 * cobre UMA versão do questionário: colunas e entrevistas daquela versão.
 * Devolve null quando `surveyId` não existe.
 */
async function gatherExport(query: z.infer<typeof exportQuery>): Promise<ExportData | null> {
  let surveyVersion: number | undefined
  if (query.surveyId) {
    const [survey] = await db.select({ version: surveys.questionnaireVersion }).from(surveys).where(eq(surveys.id, query.surveyId))
    if (!survey) return null
    surveyVersion = survey.version
  }
  const version = resolveExportVersion({ version: query.version, surveyVersion, current: await getCurrentVersion(db) })

  const questionRows = await db.select().from(questions).where(eq(questions.version, version)).orderBy(asc(questions.sortOrder))
  const csvQuestions = toCsvQuestions(questionRows)
  const pdfQuestions: PdfQuestion[] = questionRows.map((q) => ({
    key: q.key,
    number: q.number,
    text: q.text,
    type: q.type,
    section: q.section,
    options: q.options,
    sortOrder: q.sortOrder,
    groupKey: q.groupKey,
    groupText: q.groupText,
  }))

  // surveyId (uma entrevista) exporta aquele registro independentemente do status;
  // caso contrário, apenas sincronizados (opcionalmente por assentamento).
  let where: SQL | undefined
  if (query.surveyId) {
    where = eq(surveys.id, query.surveyId)
  } else if (query.settlementId) {
    where = and(eq(surveys.status, 'synced'), eq(surveys.questionnaireVersion, version), eq(surveys.settlementId, query.settlementId))
  } else {
    where = and(eq(surveys.status, 'synced'), eq(surveys.questionnaireVersion, version))
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

  return { version, csvQuestions, pdfQuestions, rows }
}

function filenameBase(query: z.infer<typeof exportQuery>, version: number): string {
  const today = new Date().toISOString().slice(0, 10)
  return query.surveyId ? `resa-entrevista-${query.surveyId}-v${version}-${today}` : `resa-survey-v${version}-${today}`
}

const NOT_FOUND = { error: 'Survey not found' }

export async function exportRoutes(app: FastifyInstance) {
  app.get('/api/admin/export.csv', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const query = exportQuery.parse(request.query)
    const data = await gatherExport(query)
    if (!data) return reply.status(404).send(NOT_FOUND)
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filenameBase(query, data.version)}.csv"`)
    return buildCsv(data.csvQuestions, data.rows)
  })

  app.get('/api/admin/export.xlsx', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const query = exportQuery.parse(request.query)
    const data = await gatherExport(query)
    if (!data) return reply.status(404).send(NOT_FOUND)
    const { header, matrix } = buildTable(data.csvQuestions, data.rows)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="${filenameBase(query, data.version)}.xlsx"`)
    return buildXlsx(header, matrix)
  })

  app.get('/api/admin/export.pdf', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const query = exportQuery.parse(request.query)
    const data = await gatherExport(query)
    if (!data) return reply.status(404).send(NOT_FOUND)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="${filenameBase(query, data.version)}.pdf"`)
    return buildSurveyReportPdf(data.pdfQuestions, data.rows, new Date())
  })
}
