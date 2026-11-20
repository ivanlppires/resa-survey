import { describe, it, expect } from 'vitest'
import { computeProgress, isAnswered, isConditionMet, unansweredBySection, type ProgressQuestion } from './progress'

const q = (key: string, section: ProgressQuestion['section'], conditional: ProgressQuestion['conditional'] = null): ProgressQuestion =>
  ({ key, section, conditional })

const questions: ProgressQuestion[] = [
  q('q1', 'socioeconomic'),
  q('q2', 'socioeconomic', { dependsOn: 'q1', showWhen: ['sim'] }),
  q('q3', 'behavioral'),
  q('q4', 'environmental'),
]

describe('isAnswered', () => {
  it('treats empty string, empty array and undefined as unanswered', () => {
    expect(isAnswered(undefined)).toBe(false)
    expect(isAnswered('   ')).toBe(false)
    expect(isAnswered([])).toBe(false)
    expect(isAnswered('x')).toBe(true)
    expect(isAnswered(['a'])).toBe(true)
    expect(isAnswered(0)).toBe(true)
  })
})

describe('isConditionMet', () => {
  it('matches string parents and array parents', () => {
    const cond = q('c', 'socioeconomic', { dependsOn: 'p', showWhen: ['sim'] })
    expect(isConditionMet(cond, new Map([['p', 'sim']]))).toBe(true)
    expect(isConditionMet(cond, new Map([['p', 'nao']]))).toBe(false)
    expect(isConditionMet(cond, new Map<string, unknown>([['p', ['sim', 'outro']]]))).toBe(true)
    expect(isConditionMet(cond, new Map())).toBe(false)
  })
})

describe('computeProgress', () => {
  it('excludes hidden conditionals from the denominator', () => {
    // q2 oculta (q1 = 'nao') → 3 aplicáveis, 1 respondida
    expect(computeProgress(questions, new Map([['q1', 'nao']]))).toBe(33)
  })

  it('includes visible conditionals and never exceeds 100', () => {
    const responses = new Map<string, unknown>([
      ['q1', 'sim'], ['q2', 'x'], ['q3', ['a']], ['q4', 5],
    ])
    expect(computeProgress(questions, responses)).toBe(100)
  })

  it('returns 0 with no questions', () => {
    expect(computeProgress([], new Map())).toBe(0)
  })
})

describe('unansweredBySection', () => {
  it('counts only applicable unanswered questions per section', () => {
    const counts = unansweredBySection(questions, new Map([['q1', 'sim']]))
    expect(counts).toEqual({ socioeconomic: 1, behavioral: 1, environmental: 1 })
  })
})

describe('quadros contam como uma pergunta', () => {
  const row = (key: string, type: string, groupKey: string): ProgressQuestion =>
    ({ key, section: 'socioeconomic', conditional: null, groupKey, type })
  const servicos = [row('s1', 'single_choice', 'servicos'), row('s2', 'single_choice', 'servicos'), row('s3', 'single_choice', 'servicos')]
  const produtos = [row('p1', 'multiple_choice', 'produtos'), row('p2', 'multiple_choice', 'produtos'), row('p3', 'multiple_choice', 'produtos')]

  it('quadro de escolha única só está respondido com todas as linhas', () => {
    const partial = new Map<string, unknown>([['s1', 'bom'], ['s2', 'ruim']])
    expect(unansweredBySection(servicos, partial).socioeconomic).toBe(1)
    expect(computeProgress(servicos, partial)).toBe(0)
    const full = new Map<string, unknown>([['s1', 'bom'], ['s2', 'ruim'], ['s3', 'bom']])
    expect(unansweredBySection(servicos, full).socioeconomic).toBe(0)
    expect(computeProgress(servicos, full)).toBe(100)
  })
  it('quadro de múltipla escolha está respondido com ao menos uma linha marcada', () => {
    expect(unansweredBySection(produtos, new Map()).socioeconomic).toBe(1)
    expect(unansweredBySection(produtos, new Map<string, unknown>([['p2', []]])).socioeconomic).toBe(1)
    expect(unansweredBySection(produtos, new Map<string, unknown>([['p2', ['venda']]])).socioeconomic).toBe(0)
  })
  it('progresso mistura perguntas simples e quadros como unidades', () => {
    const all = [q('q1', 'socioeconomic'), ...servicos, ...produtos, q('q9', 'environmental')]
    const responses = new Map<string, unknown>([['q1', 'x'], ['p1', ['consumo']]])
    expect(computeProgress(all, responses)).toBe(50) // 2 de 4 unidades
    expect(unansweredBySection(all, responses)).toEqual({ socioeconomic: 1, behavioral: 0, environmental: 1 })
  })
})
