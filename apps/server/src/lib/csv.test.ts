import { describe, it, expect } from 'vitest'
import { buildCsv, csvEscape, formatValue, type CsvQuestion, type CsvSurveyRow } from './csv.js'

const BOM = '\uFEFF'

const questions: CsvQuestion[] = [
  { key: 'q02_escolaridade', sortOrder: 2, hasTextOption: false },
  { key: 'q01_idade', sortOrder: 1, hasTextOption: false },
  { key: 'q66_problemas', sortOrder: 68, hasTextOption: true },
]

function row(overrides: Partial<CsvSurveyRow> = {}): CsvSurveyRow {
  return {
    id: 7,
    clientId: 'uuid-7',
    settlementName: 'PA Nova Esperança',
    municipality: 'Cáceres',
    biome: 'Pantanal',
    interviewerName: 'Maria',
    interviewerEmail: 'maria@resa.br',
    lotNumber: '42',
    gpsLat: -16.07,
    gpsLng: -57.68,
    createdAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T11:00:00.000Z',
    syncedAt: '2026-07-01T12:00:00.000Z',
    responses: new Map([
      ['q01_idade', { value: '21_30', textValue: null }],
      ['q66_problemas', { value: ['erosao', 'outros'], textValue: 'voçoroca' }],
    ]),
    ...overrides,
  }
}

describe('csvEscape', () => {
  it('quotes fields containing the delimiter and doubles inner quotes', () => {
    expect(csvEscape('a;b')).toBe('"a;b"')
    expect(csvEscape('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvEscape('simples')).toBe('simples')
  })

  it('neutralizes formula injection but keeps negative numbers intact', () => {
    expect(csvEscape('=1+1')).toBe("'=1+1")
    expect(csvEscape('+55 65 99999')).toBe("'+55 65 99999")
    expect(csvEscape('@soma')).toBe("'@soma")
    expect(csvEscape('-cmd|calc')).toBe("'-cmd|calc")
    expect(csvEscape('-16.07')).toBe('-16.07')
    expect(csvEscape('-16,07')).toBe('-16,07')
  })
})

describe('formatValue', () => {
  it('joins arrays with ; and stringifies scalars', () => {
    expect(formatValue(['a', 'b'])).toBe('a; b')
    expect(formatValue(4)).toBe('4')
    expect(formatValue(null)).toBe('')
  })
})

describe('buildCsv', () => {
  it('starts with BOM, orders question columns by sortOrder, adds _texto column and escapes multi-choice', () => {
    const csv = buildCsv(questions, [row()])
    expect(csv.startsWith(BOM)).toBe(true)
    const lines = csv.slice(BOM.length).trimEnd().split('\r\n')
    const header = lines[0].split(';')
    expect(header.slice(13)).toEqual(['q01_idade', 'q02_escolaridade', 'q66_problemas', 'q66_problemas_texto'])
    expect(lines[1]).toContain('"erosao; outros"')
    expect(lines[1]).toContain('voçoroca')
    expect(lines[1].split(';')[0]).toBe('7')
  })

  it('emits empty cells for unanswered questions and null metadata', () => {
    const csv = buildCsv(questions, [row({ responses: new Map(), lotNumber: null, completedAt: null })])
    const line = csv.slice(BOM.length).trimEnd().split('\r\n')[1]
    const cells = line.split(';')
    expect(cells[7]).toBe('')
    expect(cells[13]).toBe('')
    expect(cells[16]).toBe('')
  })
})
