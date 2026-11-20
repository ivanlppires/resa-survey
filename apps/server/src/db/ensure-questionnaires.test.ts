import { describe, it, expect } from 'vitest'
import { versionsToInsert } from './ensure-questionnaires.js'

describe('versionsToInsert', () => {
  it('banco vazio recebe todas as versões', () => {
    expect(versionsToInsert([], [1, 2])).toEqual([1, 2])
  })
  it('só insere a versão que falta', () => {
    expect(versionsToInsert([1], [1, 2])).toEqual([2])
    expect(versionsToInsert([2], [2, 1])).toEqual([1])
  })
  it('não insere nada quando todas existem', () => {
    expect(versionsToInsert([1, 2], [1, 2])).toEqual([])
  })
  it('versão parcialmente presente conta como presente', () => {
    expect(versionsToInsert([1, 2, 2], [1, 2])).toEqual([])
  })
  it('ignora versões do banco que o código não conhece', () => {
    expect(versionsToInsert([1, 2, 3], [1, 2])).toEqual([])
  })
})

import { incompleteVersions } from './ensure-questionnaires.js'

describe('incompleteVersions', () => {
  const defined = { 1: 70, 2: 74 }
  it('nada a avisar quando as contagens batem', () => {
    expect(incompleteVersions(new Map([[1, 70], [2, 74]]), defined)).toEqual([])
  })
  it('aponta versão presente com número de perguntas diferente do código', () => {
    expect(incompleteVersions(new Map([[1, 70], [2, 1]]), defined)).toEqual([{ version: 2, existing: 1, expected: 74 }])
    expect(incompleteVersions(new Map([[1, 71], [2, 74]]), defined)).toEqual([{ version: 1, existing: 71, expected: 70 }])
  })
  it('ignora versão ausente (será inserida) e versão que o código não conhece', () => {
    expect(incompleteVersions(new Map([[1, 70], [3, 5]]), defined)).toEqual([])
  })
})
