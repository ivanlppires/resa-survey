import { describe, it, expect } from 'vitest'
import { inflateSync } from 'node:zlib'
import { PdfDoc, encodePdfText, wrapText, textWidth } from './pdf.js'
import { buildSurveyReportPdf, formatAnswer, type PdfQuestion } from './pdf-report.js'
import type { CsvSurveyRow } from './csv.js'

/** Descomprime todos os content streams (FlateDecode) e devolve o texto latin1. */
function contentStreams(buf: Buffer): string {
  const out: string[] = []
  const open = Buffer.from('stream\n')
  const close = Buffer.from('\nendstream')
  let pos = 0
  while (true) {
    const start = buf.indexOf(open, pos)
    if (start === -1) break
    const end = buf.indexOf(close, start)
    out.push(inflateSync(buf.subarray(start + open.length, end)).toString('latin1'))
    pos = end + close.length
  }
  return out.join('\n')
}

describe('encodePdfText', () => {
  it('mantém ASCII e escapa os delimitadores ( ) \\', () => {
    expect(encodePdfText('abc')).toBe('abc')
    expect(encodePdfText('a(b)c\\d')).toBe('a\\(b\\)c\\\\d')
  })

  it('codifica acentos do português como bytes Latin-1 (WinAnsi)', () => {
    expect(encodePdfText('ç')).toBe(String.fromCharCode(0xe7))
    expect(encodePdfText('ã')).toBe(String.fromCharCode(0xe3))
    expect(encodePdfText('É')).toBe(String.fromCharCode(0xc9))
  })

  it('mapeia travessão e aspas curvas para a faixa 0x80–0x9F do CP1252', () => {
    expect(encodePdfText('—')).toBe(String.fromCharCode(0x97))
    expect(encodePdfText('“x”')).toBe(String.fromCharCode(0x93) + 'x' + String.fromCharCode(0x94))
  })

  it('substitui caracteres irrepresentáveis por ?', () => {
    expect(encodePdfText('日本')).toBe('??')
  })
})

describe('wrapText / textWidth', () => {
  it('acentuados têm a largura da letra-base', () => {
    expect(textWidth('ção', 10)).toBeCloseTo(textWidth('cao', 10), 5)
  })

  it('não quebra texto que cabe na largura', () => {
    expect(wrapText('curto', 500, 10)).toEqual(['curto'])
  })

  it('quebra em várias linhas sem exceder a largura', () => {
    const lines = wrapText('uma pergunta bem longa sobre a renda mensal da família no assentamento', 150, 10)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line, 10)).toBeLessThanOrEqual(150)
    expect(lines.join(' ')).toBe('uma pergunta bem longa sobre a renda mensal da família no assentamento')
  })

  it('quebra por caractere palavras maiores que a linha', () => {
    const lines = wrapText('a'.repeat(200), 100, 10)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line, 10)).toBeLessThanOrEqual(100)
  })
})

describe('PdfDoc', () => {
  it('gera um PDF estruturalmente válido', () => {
    const doc = new PdfDoc()
    doc.addPage()
    doc.text(50, 700, 'Olá')
    const buf = doc.toBuffer()
    expect(buf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    expect(buf.toString('latin1')).toContain('%%EOF')
    expect(buf.toString('latin1')).toContain('/Type /Catalog')
    expect(buf.toString('latin1')).toContain('/BaseFont /Helvetica')
  })

  it('os offsets do xref apontam para os objetos corretos', () => {
    const doc = new PdfDoc()
    doc.addPage()
    doc.text(50, 700, 'x')
    const buf = doc.toBuffer()
    const text = buf.toString('latin1')
    const xref = text.slice(text.indexOf('xref'))
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => parseInt(m[1], 10))
    offsets.forEach((offset, i) => {
      expect(buf.subarray(offset, offset + 20).toString('latin1')).toMatch(new RegExp(`^${i + 1} 0 obj`))
    })
  })

  it('uma página por chamada de addPage, todas no /Kids', () => {
    const doc = new PdfDoc()
    doc.addPage()
    doc.addPage()
    const text = doc.toBuffer().toString('latin1')
    expect(text).toContain('/Count 2')
    expect(text).toContain('/Kids [6 0 R 8 0 R]')
  })
})

const QUESTIONS: PdfQuestion[] = [
  {
    key: 'renda', number: 1, text: 'Qual a renda mensal da família?', type: 'single_choice',
    section: 'socioeconomic', sortOrder: 1,
    options: [
      { value: 'ate_1', label: 'Até 1 salário mínimo' },
      { value: 'outro', label: 'Outro', hasTextInput: true },
    ],
  },
  {
    key: 'praticas', number: 30, text: 'Quais práticas de conservação utiliza?', type: 'multiple_choice',
    section: 'environmental', sortOrder: 2,
    options: [
      { value: 'rotacao', label: 'Rotação de culturas' },
      { value: 'plantio_direto', label: 'Plantio direto' },
    ],
  },
]

function makeRow(overrides: Partial<CsvSurveyRow> = {}): CsvSurveyRow {
  return {
    id: 7,
    clientId: 'abc-123',
    settlementName: 'PA Nova Esperança',
    municipality: 'Cáceres',
    biome: 'Pantanal',
    interviewerName: 'Maria Souza',
    interviewerEmail: 'maria@resa.unemat.br',
    lotNumber: '007',
    gpsLat: -16.07123,
    gpsLng: -57.68145,
    createdAt: '2026-08-01T14:00:00.000Z',
    completedAt: '2026-08-01T15:00:00.000Z',
    syncedAt: '2026-08-02T09:00:00.000Z',
    responses: new Map([
      ['renda', { value: 'ate_1', textValue: null }],
      ['praticas', { value: ['rotacao', 'plantio_direto'], textValue: 'Também usa adubo verde' }],
    ]),
    ...overrides,
  }
}

describe('formatAnswer', () => {
  const q = QUESTIONS[0]

  it('resolve o rótulo da opção', () => {
    expect(formatAnswer(q, 'ate_1')).toBe('Até 1 salário mínimo')
  })

  it('une listas com os rótulos resolvidos', () => {
    expect(formatAnswer(QUESTIONS[1], ['rotacao', 'plantio_direto'])).toBe('Rotação de culturas, Plantio direto')
  })

  it('mantém o valor cru quando não há opção correspondente', () => {
    expect(formatAnswer(q, '5')).toBe('5')
    expect(formatAnswer(q, null)).toBe('—')
  })
})

describe('buildSurveyReportPdf', () => {
  const generatedAt = new Date('2026-08-14T12:00:00.000Z')

  it('inclui perguntas, rótulos de resposta e observação no conteúdo', () => {
    const buf = buildSurveyReportPdf(QUESTIONS, [makeRow()], generatedAt)
    const content = contentStreams(buf)
    expect(content).toContain('1. Qual a renda mensal da fam') // "família" tem byte latin1 no meio
    expect(content).toContain(encodePdfText('Até 1 salário mínimo'))
    expect(content).toContain(encodePdfText('Rotação de culturas, Plantio direto'))
    expect(content).toContain(encodePdfText('Observação: Também usa adubo verde'))
    expect(content).toContain('PA Nova Esperan')
  })

  it('uma entrevista: título "Entrevista #id", sem resumo', () => {
    const content = contentStreams(buildSurveyReportPdf(QUESTIONS, [makeRow()], generatedAt))
    expect(content).toContain('Entrevista #7')
    expect(content).not.toContain('Resumo por assentamento')
  })

  it('várias entrevistas: resumo por assentamento e uma página por entrevista', () => {
    const rows = [makeRow(), makeRow({ id: 8 }), makeRow({ id: 9, settlementName: 'PA Alto Alegre' })]
    const buf = buildSurveyReportPdf(QUESTIONS, rows, generatedAt)
    const text = buf.toString('latin1')
    const content = contentStreams(buf)
    expect(content).toContain('Resumo por assentamento')
    expect(content).toContain(encodePdfText('PA Nova Esperança (Cáceres) — 2 entrevistas'))
    expect(content).toContain(encodePdfText('PA Alto Alegre (Cáceres) — 1 entrevista'))
    expect(text).toContain('/Count 4') // capa/resumo + 3 entrevistas
    expect(content).toContain(encodePdfText('Página 4 de 4'))
  })

  it('sem entrevistas: gera PDF com aviso', () => {
    const content = contentStreams(buildSurveyReportPdf(QUESTIONS, [], generatedAt))
    expect(content).toContain('Nenhuma entrevista sincronizada')
  })

  it('pula seções sem respostas', () => {
    const row = makeRow({ responses: new Map([['renda', { value: 'ate_1', textValue: null }]]) })
    const content = contentStreams(buildSurveyReportPdf(QUESTIONS, [row], generatedAt))
    expect(content).toContain(encodePdfText('Parte 1 — Socioeconômico'))
    expect(content).not.toContain(encodePdfText('Parte 3 — Ambiental'))
  })
})
