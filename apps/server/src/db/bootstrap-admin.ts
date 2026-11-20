/**
 * O seed roda em todo boot do container. O admin inicial (senha padrão) só
 * pode ser criado em instalação nova, com a tabela de usuários vazia — nunca
 * recriado porque o admin original foi renomeado ou removido.
 */
export function shouldBootstrapAdmin(userCount: number): boolean {
  return userCount === 0
}
