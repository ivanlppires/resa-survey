/**
 * Lógica pura do questionário versionado (sem Dexie nem rede), para ser
 * testável: versões em cache, e — mais abaixo — itens da tela e marcação.
 */

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
