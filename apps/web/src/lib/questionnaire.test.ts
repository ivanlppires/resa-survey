import { describe, it, expect } from 'vitest'
import { inferSurveyVersion, versionsToKeep } from './questionnaire'

describe('inferSurveyVersion', () => {
  it('respostas com chaves da v1 → 1, mesmo com a v2 em cache', () => {
    expect(inferSurveyVersion(['q01_idade', 'q02_escolaridade'], 2)).toBe(1)
  })
  it('alguma chave v2_ → 2', () => {
    expect(inferSurveyVersion(['v2_q01_idade'], 1)).toBe(2)
    expect(inferSurveyVersion(['q01_idade', 'v2_q01_idade'], 1)).toBe(2)
  })
  it('sem respostas usa a versão em cache', () => {
    expect(inferSurveyVersion([], 2)).toBe(2)
    expect(inferSurveyVersion([], 1)).toBe(1)
  })
})

describe('versionsToKeep', () => {
  const keep = (surveys: { status: string; questionnaireVersion: number }[], current: number) =>
    [...versionsToKeep(surveys, current)].sort()

  it('mantém a vigente e as versões de entrevistas ainda não sincronizadas', () => {
    expect(keep([{ status: 'in_progress', questionnaireVersion: 1 }, { status: 'synced', questionnaireVersion: 1 }], 2)).toEqual([1, 2])
    expect(keep([{ status: 'completed', questionnaireVersion: 1 }], 2)).toEqual([1, 2])
    expect(keep([{ status: 'draft', questionnaireVersion: 1 }], 2)).toEqual([1, 2])
  })
  it('descarta versão antiga quando só restam entrevistas sincronizadas', () => {
    expect(keep([{ status: 'synced', questionnaireVersion: 1 }], 2)).toEqual([2])
  })
  it('sem entrevistas mantém só a vigente', () => {
    expect(keep([], 2)).toEqual([2])
  })
})
