export interface ProgressQuestion {
  key: string
  section: 'socioeconomic' | 'behavioral' | 'environmental'
  conditional: { dependsOn: string; showWhen: string[] } | null
  /** Linhas de um quadro compartilham groupKey e contam juntas como uma pergunta. */
  groupKey?: string | null
  type?: string
}

export function isConditionMet(q: ProgressQuestion, responses: Map<string, unknown>): boolean {
  if (!q.conditional) return true
  const parent = responses.get(q.conditional.dependsOn)
  if (parent == null) return false
  if (Array.isArray(parent)) return parent.some((v) => q.conditional!.showWhen.includes(String(v)))
  return q.conditional.showWhen.includes(String(parent))
}

export function isAnswered(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function applicableQuestions(questions: ProgressQuestion[], responses: Map<string, unknown>): ProgressQuestion[] {
  return questions.filter((q) => isConditionMet(q, responses))
}

interface ProgressUnit {
  section: ProgressQuestion['section']
  answered: boolean
}

/**
 * Unidades de contagem: cada pergunta simples é uma; cada quadro é uma só.
 * Quadro de escolha única (uma coluna por linha) só está respondido com todas
 * as linhas; quadro de múltipla escolha (ex.: produtos × destino) basta uma
 * linha marcada — linha em branco ali significa "não produz".
 */
function progressUnits(questions: ProgressQuestion[], responses: Map<string, unknown>): ProgressUnit[] {
  // Cada entrada é uma pergunta simples (1 linha) ou as linhas de um quadro.
  const entries: ProgressQuestion[][] = []
  const groups = new Map<string, ProgressQuestion[]>()
  for (const q of applicableQuestions(questions, responses)) {
    const rows = q.groupKey ? groups.get(q.groupKey) : undefined
    if (rows) {
      rows.push(q)
      continue
    }
    const entry = [q]
    if (q.groupKey) groups.set(q.groupKey, entry)
    entries.push(entry)
  }
  return entries.map((rows) => {
    const done = rows.map((r) => isAnswered(responses.get(r.key)))
    const anyRowIsEnough = !!rows[0].groupKey && rows[0].type === 'multiple_choice'
    return { section: rows[0].section, answered: anyRowIsEnough ? done.some(Boolean) : done.every(Boolean) }
  })
}

export function computeProgress(questions: ProgressQuestion[], responses: Map<string, unknown>): number {
  const units = progressUnits(questions, responses)
  if (units.length === 0) return 0
  const answered = units.filter((u) => u.answered).length
  return Math.min(100, Math.round((answered / units.length) * 100))
}

export function unansweredBySection(
  questions: ProgressQuestion[],
  responses: Map<string, unknown>,
): Record<ProgressQuestion['section'], number> {
  const counts: Record<ProgressQuestion['section'], number> = { socioeconomic: 0, behavioral: 0, environmental: 0 }
  for (const u of progressUnits(questions, responses)) {
    if (!u.answered) counts[u.section]++
  }
  return counts
}
