/**
 * Relatório de entrevistas em PDF: cabeçalho do projeto, resumo por
 * assentamento (quando são várias) e uma página por entrevista com as
 * respostas agrupadas por seção — texto da pergunta e rótulo da resposta,
 * ao contrário do CSV/XLSX que exportam as chaves cruas.
 */
import { PdfDoc, A4, wrapText, textWidth, type PdfFont, type Rgb } from './pdf.js'
import type { CsvSurveyRow } from './csv.js'

export interface PdfQuestion {
  key: string
  number: number
  text: string
  type: string
  section: string
  options: { value: string; label: string; hasTextInput?: boolean }[] | null
  sortOrder: number
}

const MARGIN = 50
const CONTENT_W = A4.width - MARGIN * 2
const FOOTER_H = 40

const GREEN: Rgb = [0.13, 0.64, 0.32]
const TEXT: Rgb = [0.11, 0.11, 0.13]
const GRAY: Rgb = [0.45, 0.45, 0.47]
const RULE: Rgb = [0.88, 0.88, 0.9]

const SECTION_ORDER = ['socioeconomic', 'behavioral', 'environmental']
const SECTION_LABELS: Record<string, string> = {
  socioeconomic: 'Parte 1 — Socioeconômico',
  behavioral: 'Parte 2 — Comportamental',
  environmental: 'Parte 3 — Ambiental',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Cuiaba', dateStyle: 'short', timeStyle: 'short',
  })
}

/** Resolve o rótulo humano da resposta (opções viram labels, listas são unidas). */
export function formatAnswer(question: PdfQuestion, value: unknown): string {
  if (value == null) return '—'
  const labelFor = (v: string) => question.options?.find((o) => o.value === v)?.label ?? v
  if (Array.isArray(value)) return value.map((v) => labelFor(String(v))).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return labelFor(String(value))
}

/** Cursor descendente com quebra de página automática. */
class Cursor {
  y: number

  constructor(private doc: PdfDoc) {
    doc.addPage()
    this.y = A4.height - MARGIN
  }

  newPage(): void {
    this.doc.addPage()
    this.y = A4.height - MARGIN
  }

  /** Garante espaço vertical; senão, abre página nova. */
  ensure(height: number): void {
    if (this.y - height < MARGIN + FOOTER_H) this.newPage()
  }

  /** Escreve linhas já quebradas, avançando o cursor. */
  lines(lines: string[], size: number, font: PdfFont, color: Rgb, lineGap = 1.35): void {
    for (const line of lines) {
      this.ensure(size * lineGap)
      this.y -= size
      this.doc.text(MARGIN, this.y, line, { font, size, color })
      this.y -= size * (lineGap - 1)
    }
  }

  paragraph(text: string, size: number, font: PdfFont, color: Rgb): void {
    this.lines(wrapText(text, CONTENT_W, size, font), size, font, color)
  }

  gap(height: number): void {
    this.y -= height
  }

  rule(color: Rgb = RULE, width = 0.6): void {
    this.doc.line(MARGIN, this.y, A4.width - MARGIN, this.y, width, color)
  }
}

function drawDocHeader(doc: PdfDoc, cur: Cursor, title: string, rows: CsvSurveyRow[], generatedAt: Date): void {
  doc.rect(0, A4.height - 8, A4.width, 8, GREEN)
  cur.gap(6)
  cur.paragraph('PROJETO RESA · UNEMAT', 9, 'bold', GREEN)
  cur.gap(4)
  cur.paragraph(title, 21, 'bold', TEXT)
  cur.gap(2)
  cur.paragraph('Rede de Pesquisa para uma Economia Sustentável da Amazônia', 10, 'regular', GRAY)
  cur.gap(6)
  const count = rows.length === 1 ? '1 entrevista' : `${rows.length} entrevistas`
  cur.paragraph(`Gerado em ${fmtDateTime(generatedAt.toISOString())} · ${count}`, 9, 'regular', GRAY)
  cur.gap(10)
  cur.rule()
  cur.gap(14)
}

function drawSummary(cur: Cursor, rows: CsvSurveyRow[]): void {
  const bySettlement = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.settlementName} (${r.municipality})`
    bySettlement.set(key, (bySettlement.get(key) ?? 0) + 1)
  }
  cur.paragraph('Resumo por assentamento', 12, 'bold', TEXT)
  cur.gap(6)
  for (const [name, count] of [...bySettlement.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    cur.paragraph(`${name} — ${count === 1 ? '1 entrevista' : `${count} entrevistas`}`, 10, 'regular', TEXT)
    cur.gap(2)
  }
}

function drawInterview(cur: Cursor, row: CsvSurveyRow, questions: PdfQuestion[], withLabel: boolean): void {
  if (withLabel) {
    // No relatório de várias entrevistas, identifica cada uma; no export de
    // uma só, o título do documento já a identifica.
    cur.paragraph(`ENTREVISTA #${row.id}`, 9, 'bold', GREEN)
    cur.gap(3)
  }
  cur.paragraph(row.settlementName, 15, 'bold', TEXT)
  cur.gap(4)
  const meta = [
    `Município: ${row.municipality} · Bioma: ${row.biome}`,
    `Entrevistador(a): ${row.interviewerName} (${row.interviewerEmail})`,
    `Lote: ${row.lotNumber ?? '—'} · GPS: ${row.gpsLat != null && row.gpsLng != null ? `${row.gpsLat.toFixed(5)}, ${row.gpsLng.toFixed(5)}` : '—'}`,
    `Criada: ${fmtDateTime(row.createdAt)} · Concluída: ${fmtDateTime(row.completedAt)} · Sincronizada: ${fmtDateTime(row.syncedAt)}`,
  ]
  for (const line of meta) {
    cur.paragraph(line, 9, 'regular', GRAY)
    cur.gap(2)
  }
  cur.gap(8)

  for (const section of SECTION_ORDER) {
    const answered = questions.filter((q) => q.section === section && row.responses.has(q.key))
    if (answered.length === 0) continue

    cur.ensure(40) // não deixa o título da seção órfão no pé da página
    cur.paragraph(SECTION_LABELS[section] ?? section, 11.5, 'bold', GREEN)
    cur.gap(3)
    cur.rule(GREEN, 1)
    cur.gap(10)

    for (const q of answered) {
      const resp = row.responses.get(q.key)
      const qLines = wrapText(`${q.number}. ${q.text}`, CONTENT_W, 9, 'regular')
      const aLines = wrapText(formatAnswer(q, resp?.value), CONTENT_W, 10.5, 'bold')
      const tLines = resp?.textValue ? wrapText(`Observação: ${resp.textValue}`, CONTENT_W, 9, 'oblique') : []
      const blockHeight = qLines.length * 9 * 1.35 + aLines.length * 10.5 * 1.35 + tLines.length * 9 * 1.35 + 10
      cur.ensure(Math.min(blockHeight, 200)) // mantém o bloco junto quando cabe
      cur.lines(qLines, 9, 'regular', GRAY)
      cur.gap(2)
      cur.lines(aLines, 10.5, 'bold', TEXT)
      if (tLines.length > 0) {
        cur.gap(1)
        cur.lines(tLines, 9, 'oblique', GRAY)
      }
      cur.gap(9)
    }
    cur.gap(4)
  }
}

function drawFooters(doc: PdfDoc): void {
  const total = doc.pageCount
  for (let i = 0; i < total; i++) {
    doc.line(MARGIN, MARGIN - 14, A4.width - MARGIN, MARGIN - 14, 0.5, RULE, i)
    doc.text(MARGIN, MARGIN - 26, 'RESA — Relatório de Entrevistas', { size: 7.5, color: GRAY }, i)
    const label = `Página ${i + 1} de ${total}`
    doc.text(A4.width - MARGIN - textWidth(label, 7.5), MARGIN - 26, label, { size: 7.5, color: GRAY }, i)
  }
}

export function buildSurveyReportPdf(questions: PdfQuestion[], rows: CsvSurveyRow[], generatedAt: Date): Buffer {
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder)
  const doc = new PdfDoc()
  const cur = new Cursor(doc)
  const single = rows.length === 1

  drawDocHeader(doc, cur, single ? `Entrevista #${rows[0].id}` : 'Relatório de Entrevistas', rows, generatedAt)

  if (rows.length === 0) {
    cur.paragraph('Nenhuma entrevista sincronizada para os filtros selecionados.', 11, 'regular', GRAY)
  } else if (single) {
    drawInterview(cur, rows[0], sorted, false)
  } else {
    drawSummary(cur, rows)
    for (const row of rows) {
      cur.newPage()
      drawInterview(cur, row, sorted, true)
    }
  }

  drawFooters(doc)
  return doc.toBuffer()
}
