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
