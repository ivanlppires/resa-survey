import type { QuestionSeed } from './types.js'
import { questionsV1 } from './v1.js'
import { questionsV2 } from './v2.js'

export type { QuestionSeed } from './types.js'

/** Conteúdo de cada versão do questionário. A vigente é a de maior número. */
export const questionnaires: Record<number, QuestionSeed[]> = {
  1: questionsV1,
  2: questionsV2,
}
