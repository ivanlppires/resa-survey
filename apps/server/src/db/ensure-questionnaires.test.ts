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
