export interface ProgressQuestion {
  key: string
  section: 'socioeconomic' | 'behavioral' | 'environmental'
  conditional: { dependsOn: string; showWhen: string[] } | null
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

export function computeProgress(questions: ProgressQuestion[], responses: Map<string, unknown>): number {
  const applicable = applicableQuestions(questions, responses)
  if (applicable.length === 0) return 0
  const answered = applicable.filter((q) => isAnswered(responses.get(q.key))).length
  return Math.min(100, Math.round((answered / applicable.length) * 100))
}

export function unansweredBySection(
  questions: ProgressQuestion[],
  responses: Map<string, unknown>,
): Record<ProgressQuestion['section'], number> {
  const counts: Record<ProgressQuestion['section'], number> = { socioeconomic: 0, behavioral: 0, environmental: 0 }
  for (const q of applicableQuestions(questions, responses)) {
    if (!isAnswered(responses.get(q.key))) counts[q.section]++
  }
  return counts
}
