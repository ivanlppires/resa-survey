import { describe, it, expect } from 'vitest'
import { questionsV1 } from './v1.js'
import { questionsV2 } from './v2.js'
import { questionnaires } from './index.js'

const byNumber = (n: number) => questionsV2.filter((q) => q.number === n)

describe('questionário v1 (arquivo)', () => {
  it('preserva as 70 perguntas originais', () => {
    expect(questionsV1).toHaveLength(70)
    expect(questionsV1.every((q) => q.version === 1)).toBe(true)
    expect(questionsV1.every((q) => !q.key.startsWith('v2_'))).toBe(true)
    expect(questionsV1.map((q) => q.sortOrder)).toEqual(Array.from({ length: 70 }, (_, i) => i + 1))
    expect(questionsV1).toMatchSnapshot()
  })
})

describe('questionário v2 (revisado)', () => {
  it('tem a forma do documento revisado', () => {
    expect(questionsV2).toHaveLength(74)
    expect(questionsV2.every((q) => q.version === 2 && q.key.startsWith('v2_') && q.key.length <= 50)).toBe(true)
    expect(new Set(questionsV2.map((q) => q.key)).size).toBe(74)
    expect(questionsV2.map((q) => q.sortOrder)).toEqual(Array.from({ length: 74 }, (_, i) => i + 1))
    const numbers = [...new Set(questionsV2.map((q) => q.number))]
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => n !== 13 && n !== 37))
    const groupSize = (k: string) => questionsV2.filter((q) => q.groupKey === k).length
    expect([groupSize('v2_q16_produtos'), groupSize('v2_q27_servicos'), groupSize('v2_q38_afirmacoes')]).toEqual([12, 6, 10])
    expect(questionsV2.filter((q) => q.groupKey).length).toBe(28)
    expect(questionsV2.filter((q) => q.maxSelections != null).map((q) => [q.number, q.maxSelections])).toEqual([[30, 3]])
    expect(questionsV2.filter((q) => q.conditional).map((q) => q.number)).toEqual([26])
    expect(questionsV2.filter((q) => q.type === 'scale').map((q) => [q.number, q.scaleMin, q.scaleMax])).toEqual([[50, 1, 5]])
  })

  it('distribui seções e subtítulos como no documento', () => {
    for (const q of questionsV2) {
      const expected = q.number <= 30 ? 'socioeconomic' : q.number <= 39 ? 'behavioral' : 'environmental'
      expect([q.key, q.section]).toEqual([q.key, expected])
      expect([q.key, !!q.subsection]).toEqual([q.key, q.number <= 30])
    }
    expect([...new Set(questionsV2.map((q) => q.subsection).filter(Boolean))]).toEqual([
      'A. Família e trabalho', 'B. Renda', 'C. Terra', 'D. Produção e comercialização',
      'E. Gestão, apoio e crédito', 'F. Condições de vida e perspectivas',
    ])
  })

  it('quadros: linhas compartilham número, enunciado e alternativas', () => {
    for (const [groupKey, type, values] of [
      ['v2_q16_produtos', 'multiple_choice', ['consumo', 'venda']],
      ['v2_q27_servicos', 'single_choice', ['bom', 'regular', 'ruim', 'nao_tem']],
      ['v2_q38_afirmacoes', 'single_choice', ['sim', 'em_parte', 'nao']],
    ] as const) {
      const rows = questionsV2.filter((q) => q.groupKey === groupKey)
      expect(new Set(rows.map((q) => q.number)).size).toBe(1)
      expect(new Set(rows.map((q) => q.groupText)).size).toBe(1)
      expect(rows[0].groupText).toBeTruthy()
      for (const r of rows) {
        expect(r.type).toBe(type)
        expect(r.options!.map((o) => o.value)).toEqual([...values])
      }
      // linhas de um quadro são consecutivas
      const orders = rows.map((q) => q.sortOrder)
      expect(orders[orders.length - 1] - orders[0]).toBe(rows.length - 1)
    }
    const outro = questionsV2.filter((q) => q.groupKey === 'v2_q16_produtos').at(-1)!
    expect(outro.text).toBe('Outro')
    expect(outro.options!.every((o) => o.hasTextInput)).toBe(true)
    expect(questionsV2.filter((q) => q.groupKey === 'v2_q38_afirmacoes').every((q) => !/^[a-j]\)/.test(q.text))).toBe(true)
  })

  it('alternativas: exclusivas só em múltipla escolha, "Outro" com texto, sem instruções', () => {
    for (const q of questionsV2) {
      const opts = q.options ?? []
      if (q.type !== 'scale') expect([q.key, opts.length > 1]).toEqual([q.key, true])
      expect([q.key, new Set(opts.map((o) => o.value)).size]).toEqual([q.key, opts.length])
      for (const o of opts) {
        expect(o.value).toMatch(/^[a-z0-9_]+$/)
        if (o.exclusive) expect([q.key, q.type]).toEqual([q.key, 'multiple_choice'])
        if (/^Outr[oa]$/.test(o.label)) expect([q.key, o.hasTextInput]).toEqual([q.key, true])
        expect(o.label.toLowerCase()).not.toContain('marque')
      }
      expect(q.text.toLowerCase()).not.toContain('marque')
    }
    const exclusiveLabels = questionsV2.flatMap((q) => (q.options ?? []).filter((o) => o.exclusive).map((o) => `${q.number}:${o.label}`))
    expect(exclusiveLabels).toEqual([
      '11:Não se aplica (não há esses períodos)', '14:Nenhum', '18:Não comercializa', '21:Nenhuma', '23:Nenhuma',
      '25:Não participa', '26:Nunca utilizou e não tem interesse', '26:Nunca utilizou, mas gostaria',
      '39:Não tem interesse', '41:Não utiliza', '44:Nenhuma', '47:Não utiliza', '48:Não observa problemas', '49:Não',
    ])
  })

  it('aplica os ajustes aprovados nas perguntas 26 e 46', () => {
    const [q26, q26b] = byNumber(26)
    expect(q26.type).toBe('multiple_choice')
    expect(q26.options!.map((o) => o.label)).toEqual([
      'Nunca utilizou e não tem interesse', 'Nunca utilizou, mas gostaria', 'Sim, PRONAF', 'Sim, outra linha de crédito',
    ])
    expect(q26b.type).toBe('multiple_choice')
    expect(q26b.text).toBe('Para qual finalidade?')
    expect(q26b.options!.map((o) => o.label)).toEqual(['Custeio', 'Investimento ou infraestrutura'])
    expect(q26b.conditional!.dependsOn).toBe(q26.key)
    expect(q26b.conditional!.showWhen).toEqual(q26.options!.filter((o) => o.label.startsWith('Sim')).map((o) => o.value))
    expect(byNumber(46)[0].options!.map((o) => o.label)).toEqual([
      'Não', 'Sim, até 2 ha', 'Sim, mais de 2 até 5 ha', 'Sim, mais de 5 até 10 ha', 'Sim, mais de 10 ha', 'Não sabe informar',
    ])
  })
})

describe('conjunto de versões', () => {
  it('chaves das versões não colidem', () => {
    const v1 = new Set(questionsV1.map((q) => q.key))
    expect(questionsV2.filter((q) => v1.has(q.key))).toEqual([])
    expect(Object.keys(questionnaires)).toEqual(['1', '2'])
    expect(questionnaires[1]).toBe(questionsV1)
    expect(questionnaires[2]).toBe(questionsV2)
  })
})
