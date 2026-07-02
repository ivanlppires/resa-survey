export interface CsvQuestion {
  key: string
  sortOrder: number
  hasTextOption: boolean
}

export interface CsvSurveyRow {
  id: number
  clientId: string | null
  settlementName: string
  municipality: string
  biome: string
  interviewerName: string
  interviewerEmail: string
  lotNumber: string | null
  gpsLat: number | null
  gpsLng: number | null
  createdAt: string
  completedAt: string | null
  syncedAt: string | null
  responses: Map<string, { value: unknown; textValue: string | null }>
}

const META_HEADERS = [
  'id', 'client_id', 'assentamento', 'municipio', 'bioma',
  'entrevistador', 'email_entrevistador', 'lote', 'gps_lat', 'gps_lng',
  'criado_em', 'concluido_em', 'sincronizado_em',
]

/** Neutraliza injeção de fórmula (Excel/LibreOffice) sem corromper números negativos. */
function guardFormula(field: string): string {
  if (/^[=+@\t\r]/.test(field)) return `'${field}`
  if (field.startsWith('-') && !/^-\d+([.,]\d+)?$/.test(field)) return `'${field}`
  return field
}

export function csvEscape(field: string): string {
  const guarded = guardFormula(field)
  if (/[";\n\r]/.test(guarded)) return '"' + guarded.replace(/"/g, '""') + '"'
  return guarded
}

export function formatValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(String).join('; ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function buildCsv(questions: CsvQuestion[], rows: CsvSurveyRow[]): string {
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder)
  const header = [...META_HEADERS]
  for (const q of sorted) {
    header.push(q.key)
    if (q.hasTextOption) header.push(`${q.key}_texto`)
  }

  const lines = [header.map(csvEscape).join(';')]
  for (const r of rows) {
    const cells = [
      String(r.id), r.clientId ?? '', r.settlementName, r.municipality, r.biome,
      r.interviewerName, r.interviewerEmail, r.lotNumber ?? '',
      r.gpsLat != null ? String(r.gpsLat) : '', r.gpsLng != null ? String(r.gpsLng) : '',
      r.createdAt, r.completedAt ?? '', r.syncedAt ?? '',
    ]
    for (const q of sorted) {
      const resp = r.responses.get(q.key)
      cells.push(formatValue(resp?.value))
      if (q.hasTextOption) cells.push(resp?.textValue ?? '')
    }
    lines.push(cells.map(csvEscape).join(';'))
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
