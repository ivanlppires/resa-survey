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

import { toggleOption, buildItems } from './questionnaire'
import type { LocalQuestion } from './db'

describe('toggleOption', () => {
  const opts = [{ value: 'nenhuma', exclusive: true }, { value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }]

  it('marca e desmarca alternativas comuns', () => {
    expect(toggleOption([], 'a', opts, null)).toEqual(['a'])
    expect(toggleOption(['a'], 'b', opts, null)).toEqual(['a', 'b'])
    expect(toggleOption(['a'], 'a', opts, null)).toEqual([])
  })
  it('marcar a exclusiva desmarca todas as outras', () => {
    expect(toggleOption(['a', 'b'], 'nenhuma', opts, null)).toEqual(['nenhuma'])
  })
  it('marcar uma comum desmarca a exclusiva', () => {
    expect(toggleOption(['nenhuma'], 'a', opts, null)).toEqual(['a'])
  })
  it('duas exclusivas não convivem', () => {
    const two = [{ value: 'x', exclusive: true }, { value: 'y', exclusive: true }, { value: 'a' }]
    expect(toggleOption(['x'], 'y', two, null)).toEqual(['y'])
  })
  it('no limite, marcar outra não muda nada; desmarcar continua possível', () => {
    expect(toggleOption(['a', 'b', 'c'], 'd', opts, 3)).toEqual(['a', 'b', 'c'])
    expect(toggleOption(['a', 'b', 'c'], 'c', opts, 3)).toEqual(['a', 'b'])
    expect(toggleOption(['a', 'b'], 'c', opts, 3)).toEqual(['a', 'b', 'c'])
  })
  it('a exclusiva pode ser marcada mesmo com o limite atingido', () => {
    expect(toggleOption(['a', 'b', 'c'], 'nenhuma', opts, 3)).toEqual(['nenhuma'])
  })
})

describe('buildItems', () => {
  const lq = (key: string, sortOrder: number, group?: string): LocalQuestion => ({
    id: sortOrder, key, number: group ? 27 : sortOrder, text: `texto ${key}`, type: 'single_choice', section: 'socioeconomic',
    options: null, scaleMin: null, scaleMax: null, conditional: null, sortOrder, version: 2,
    groupKey: group ?? null, groupText: group ? 'Enunciado do quadro' : null, subsection: null, maxSelections: null,
  })

  it('junta linhas consecutivas do mesmo quadro em um item', () => {
    const items = buildItems([lq('q1', 1), lq('ga', 2, 'g'), lq('gb', 3, 'g'), lq('q2', 4)])
    expect(items.map((i) => i.kind)).toEqual(['question', 'group', 'question'])
    const group = items[1]
    if (group.kind !== 'group') throw new Error('esperava quadro')
    expect(group.groupKey).toBe('g')
    expect(group.number).toBe(27)
    expect(group.text).toBe('Enunciado do quadro')
    expect(group.rows.map((r) => r.key)).toEqual(['ga', 'gb'])
  })
  it('quadros diferentes em sequência ficam separados', () => {
    const items = buildItems([lq('ga', 1, 'g'), lq('ha', 2, 'h')])
    expect(items.map((i) => (i.kind === 'group' ? i.groupKey : i.kind))).toEqual(['g', 'h'])
  })
  it('sem perguntas não há itens', () => {
    expect(buildItems([])).toEqual([])
  })
})
