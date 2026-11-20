import { describe, it, expect } from 'vitest'
import { shouldBootstrapAdmin } from './bootstrap-admin.js'

describe('shouldBootstrapAdmin', () => {
  it('cria o admin inicial só em banco sem nenhum usuário', () => {
    expect(shouldBootstrapAdmin(0)).toBe(true)
  })
  it('nunca recria o admin padrão quando já existem usuários (o seed roda em todo boot)', () => {
    expect(shouldBootstrapAdmin(1)).toBe(false)
    expect(shouldBootstrapAdmin(12)).toBe(false)
  })
})
