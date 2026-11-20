/**
 * Lógica pura do questionário versionado (sem Dexie nem rede), para ser
 * testável: versões em cache, e — mais abaixo — itens da tela e marcação.
 */
import type { LocalQuestion } from './db'

/**
 * Versão de uma entrevista local que ainda não tinha o campo gravado
 * (criada antes do versionamento). As chaves das respostas mandam: as da v2
 * têm prefixo `v2_`. Sem respostas, vale a versão das perguntas em cache.
 */
export function inferSurveyVersion(responseKeys: string[], fallback: number): number {
  if (responseKeys.length === 0) return fallback
  return responseKeys.some((k) => k.startsWith('v2_')) ? 2 : 1
}

/**
 * Versões cujas perguntas precisam ficar no cache: a vigente e as de toda
 * entrevista local ainda não sincronizada (para que possa ser concluída
 * offline com o questionário em que começou).
 */
export function versionsToKeep(
  surveys: { status: string; questionnaireVersion: number }[],
  current: number,
): Set<number> {
  const keep = new Set([current])
  for (const s of surveys) {
    if (s.status !== 'synced') keep.add(s.questionnaireVersion)
  }
  return keep
}

/** O que a tela mostra em um cartão: uma pergunta simples ou um quadro (várias linhas). */
export type SurveyItem =
  | { kind: 'question'; question: LocalQuestion }
  | { kind: 'group'; groupKey: string; number: number; text: string; rows: LocalQuestion[] }

/** Agrupa linhas consecutivas do mesmo quadro (groupKey) em um único item, preservando a ordem. */
export function buildItems(questions: LocalQuestion[]): SurveyItem[] {
  const items: SurveyItem[] = []
  for (const q of questions) {
    if (!q.groupKey) {
      items.push({ kind: 'question', question: q })
      continue
    }
    const last = items[items.length - 1]
    if (last?.kind === 'group' && last.groupKey === q.groupKey) {
      last.rows.push(q)
    } else {
      items.push({ kind: 'group', groupKey: q.groupKey, number: q.number, text: q.groupText ?? '', rows: [q] })
    }
  }
  return items
}

/**
 * Próximo valor de uma múltipla escolha ao tocar em `optValue`.
 * - desmarcar é sempre permitido;
 * - alternativa exclusiva ("Nenhuma", "Não se aplica"…) fica sozinha;
 * - marcar uma comum desmarca as exclusivas;
 * - com `maxSelections` atingido, marcar outra comum não muda nada.
 */
export function toggleOption(
  current: string[],
  optValue: string,
  options: { value: string; exclusive?: boolean }[],
  maxSelections: number | null,
): string[] {
  if (current.includes(optValue)) return current.filter((v) => v !== optValue)
  const exclusive = new Set(options.filter((o) => o.exclusive).map((o) => o.value))
  if (exclusive.has(optValue)) return [optValue]
  const kept = current.filter((v) => !exclusive.has(v))
  if (maxSelections != null && kept.length >= maxSelections) return current
  return [...kept, optValue]
}
