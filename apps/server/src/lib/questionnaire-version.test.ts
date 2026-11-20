import { describe, it, expect } from 'vitest'
import { isArchivedVersion, deriveQuestionnaireVersion, parseVersionParam, resolveExportVersion } from './questionnaire-version.js'

const m = new Map([['q01_idade', 1], ['v2_q01_idade', 2], ['v2_q02_escolaridade', 2]])

describe('deriveQuestionnaireVersion', () => {
  it('usa a versão das chaves das respostas', () => {
    expect(deriveQuestionnaireVersion(['q01_idade'], m)).toEqual({ version: 1, mixed: false })
    expect(deriveQuestionnaireVersion(['v2_q01_idade', 'v2_q02_escolaridade'], m)).toEqual({ version: 2, mixed: false })
  })
  it('as chaves vencem o que o app declarou', () => {
    expect(deriveQuestionnaireVersion(['v2_q01_idade'], m, 1)).toEqual({ version: 2, mixed: false })
    expect(deriveQuestionnaireVersion(['q01_idade'], m, 2)).toEqual({ version: 1, mixed: false })
  })
  it('sem respostas e sem versão declarada (app antigo) é v1', () => {
    expect(deriveQuestionnaireVersion([], m)).toEqual({ version: 1, mixed: false })
  })
  it('sem respostas usa a versão declarada pelo app', () => {
    expect(deriveQuestionnaireVersion([], m, 2)).toEqual({ version: 2, mixed: false })
  })
  it('ignora chaves desconhecidas', () => {
    expect(deriveQuestionnaireVersion(['desconhecida'], m)).toEqual({ version: 1, mixed: false })
    expect(deriveQuestionnaireVersion(['desconhecida'], m, 2)).toEqual({ version: 2, mixed: false })
    expect(deriveQuestionnaireVersion(['desconhecida', 'v2_q01_idade'], m)).toEqual({ version: 2, mixed: false })
  })
  it('versões misturadas: fica a da maioria e sinaliza', () => {
    expect(deriveQuestionnaireVersion(['q01_idade', 'v2_q01_idade', 'v2_q02_escolaridade'], m)).toEqual({ version: 2, mixed: true })
  })
  it('empate entre versões fica com a maior', () => {
    expect(deriveQuestionnaireVersion(['q01_idade', 'v2_q01_idade'], m)).toEqual({ version: 2, mixed: true })
  })
})

describe('parseVersionParam', () => {
  it('sem parâmetro é a v1 (rota fixa para o app antigo em cache)', () => {
    expect(parseVersionParam(undefined, 2)).toBe(1)
  })
  it('"current" é a vigente', () => {
    expect(parseVersionParam('current', 2)).toBe(2)
  })
  it('número pede a versão exata', () => {
    expect(parseVersionParam('1', 2)).toBe(1)
    expect(parseVersionParam('2', 2)).toBe(2)
  })
  it('valor inválido é null', () => {
    for (const bad of ['abc', '0', '-1', '1.5', '', '2x']) expect(parseVersionParam(bad, 2)).toBeNull()
  })
})

describe('resolveExportVersion', () => {
  it('sem filtro exporta a versão vigente', () => {
    expect(resolveExportVersion({ current: 2 })).toBe(2)
  })
  it('version pedido tem prioridade sobre a vigente', () => {
    expect(resolveExportVersion({ version: 1, current: 2 })).toBe(1)
  })
  it('uma entrevista exporta sempre na versão dela', () => {
    expect(resolveExportVersion({ version: 1, surveyVersion: 2, current: 2 })).toBe(2)
    expect(resolveExportVersion({ surveyVersion: 1, current: 2 })).toBe(1)
  })
})

describe('isArchivedVersion', () => {
  it('versões anteriores à vigente são arquivo (somente leitura)', () => {
    expect(isArchivedVersion(1, 2)).toBe(true)
  })
  it('a vigente continua editável', () => {
    expect(isArchivedVersion(2, 2)).toBe(false)
    expect(isArchivedVersion(1, 1)).toBe(false)
  })
})
