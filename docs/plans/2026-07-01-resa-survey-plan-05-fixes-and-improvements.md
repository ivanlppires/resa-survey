# RESA Survey — Plan 05: Correções e Melhorias

**Data:** 2026-07-01
**Escopo:** Correção de todos os bugs conhecidos (integridade de dados, offline, UX) + features de maior valor (exportação CSV, visualização de respostas no admin, sincronização automática, leitura de questionários sincronizados).
**Fora de escopo (fase futura):** mapa Leaflet, gráficos Recharts, relatórios PDF, visão pública para parceiros, upload de shapefiles.

> Decisões tomadas autonomamente (usuário ausente durante o brainstorming): escopo "correções + features-chave"; assumido que a VPS pode ter dados reais → todas as migrações são aditivas e seguras para dados existentes.

## 1. Integridade do sync (crítico)

### Problema
1. O cliente marca questionário como `synced` se o POST `/api/sync` responder 2xx, **ignorando o corpo** — se o servidor reportar erro naquele questionário (ex.: FK de assentamento), o dado é perdido silenciosamente.
2. O hash de idempotência inclui `syncedAt` (novo a cada tentativa) → **nunca** detecta duplicata. Resposta HTTP perdida após insert bem-sucedido (comum em rede rural) → reenvio → **questionário duplicado** no Postgres.
3. `sync_log` registra apenas o primeiro questionário do lote.

### Solução
- **Servidor:** coluna `client_id text` em `surveys` com `UNIQUE` (NULLs legados não conflitam — semântica padrão do Postgres). No sync, para cada questionário: se `client_id` já existe → responde sucesso (idempotente, sem novo insert); senão insere questionário + respostas **numa transação**. Um registro em `sync_log` por questionário inserido. O gate por `payloadHash` deixa de existir como mecanismo de dedup (a coluna `payload_hash` permanece para auditoria).
- **Cliente:** envia `localId` na metadata de cada questionário; envia **todos os pendentes num único POST** (menos round-trips em rede ruim); só marca `synced` os `localId`s confirmados em `syncedLocalIds` da resposta. Guard de execução única em módulo (`sync` concorrente não dispara requisição dupla — inócuo com dedup, mas evita ruído).
- **Tipos compartilhados** (`@resa/shared`) atualizados para refletir o contrato real: `SyncSurveyMetadata { localId, settlementId, lotNumber, gpsLat, gpsLng, status, deviceInfo, createdAt, updatedAt, completedAt }`, `SyncResult { syncedLocalIds: string[], errors: { localId, message }[] }`. Cliente monta o payload com esses tipos (typecheck de verdade); zod do servidor espelha o contrato.
- **Compatibilidade:** o zod do servidor aceita `localId` opcional durante a transição (app antigo em campo continua funcionando, sem dedup para ele).

### Migração
```sql
ALTER TABLE surveys ADD COLUMN client_id text;
ALTER TABLE surveys ADD CONSTRAINT surveys_client_id_unique UNIQUE (client_id);
```
Gerada via `drizzle-kit generate`; aplicada no deploy com `drizzle-kit push` (ou migrate). Duplicatas legadas eventualmente já criadas em produção: identificáveis por (settlement_id, lot_number, created_at) idênticos — limpeza manual documentada, fora do código.

## 2. `cleanupStaleSurveys` apaga dados não sincronizados (crítico)

**Problema:** questionário completo mas não sincronizado cujo assentamento foi removido do servidor é apagado do IndexedDB → perda permanente de dados de campo.

**Solução:** a regra de "órfão" só se aplica a questionários com `status === 'synced'`. Questionários `draft/in_progress/completed` **nunca** são apagados automaticamente. A regra dos 7 dias para synced permanece.

## 3. Campo "Outro (especifique)" (crítico — 11 opções do questionário usam)

**Problemas:** escolha única — 1 caractere digitado vira valor `"outro:x"`, a opção desmarca e o input desmonta; múltipla escolha — o texto **nunca é salvo**; reabrir questionário não restaura o texto.

**Solução — `textValue` separado do `value`:**
- `LocalResponse` (Dexie) ganha `textValue?: string` (propriedade sem índice — não exige bump de versão, mas o bump virá pela store de settlements, ver §4).
- `SurveyPage`: `saveResponse(key, value, textValue?)`. Escolha única: `value` permanece `'outro'`; input separado bound ao `textValue`. Múltipla: `value: string[]` + um `textValue` (na prática só uma opção `hasTextInput` por pergunta). Restaura ao carregar.
- Servidor: coluna `text_value text` em `responses` (aditiva); zod aceita `textValue` opcional; insert persiste.
- Dados legados com encoding `"valor:texto"`: permanecem como estão no banco; a exportação CSV os emite crus (documentado). Volume esperado ≈ 0.

## 4. Assentamentos offline (crítico)

**Problema:** `NewSurveyPage` busca assentamentos só da rede (cache do SW expira em 24h) → sem internet não dá para iniciar questionário.

**Solução:** store `settlements` no Dexie (**versão 2** do schema: `settlements: 'id'`), `syncSettlements()` espelho de `syncQuestions()` (rede → substitui cache; falha → usa cache). `NewSurveyPage` lê do Dexie após tentativa de refresh. `SurveyListPage` chama `syncSettlements()` junto com `syncQuestions()`.

## 5. Sincronização automática

**Problema:** sync só no botão manual; promessa "sincroniza automaticamente ao reconectar" não cumprida.

**Solução:** na `SurveyListPage` (home do entrevistador): ao montar e no evento `window online`, se `navigator.onLine` e houver pendentes → dispara sync (com o guard do §1) e toasts de resultado. Finalizar questionário navega para `/` → o mount dispara o sync. Sem retry/backoff em background (YAGNI — o evento `online` + abrir o app cobrem o caso de uso real).

## 6. Progresso e validação de conclusão

- **Progresso:** denominador = perguntas **aplicáveis** (não-condicionais + condicionais com condição satisfeita); numerador = aplicáveis com resposta não-vazia (texto `trim() !== ''`, múltipla `length > 0`, demais definidas). Nunca passa de 100%.
- **Finalizar:** se houver aplicáveis sem resposta, bottom-sheet de confirmação: "N perguntas sem resposta (X Socioeconômico, Y Comportamental, Z Ambiental)" com "Finalizar mesmo assim" / "Continuar respondendo" (recusa de resposta é legítima em pesquisa de campo — confirmar, não bloquear).

## 7. Sessão expirada (JWT 7d) invisível

- `apiFetch` lança `ApiError` com `status`.
- Sync distingue 401: retorna sinal `authExpired` → toast "Sessão expirada — entre novamente para sincronizar" (dados locais preservados; logout não toca o Dexie).
- `AuthProvider` ao montar, **se online**, valida token via `GET /auth/me`; 401 → logout. Erro de rede → mantém sessão (offline-first).

## 8. Segurança

- `JWT_SECRET`: obrigatório em produção (`NODE_ENV === 'production'` sem secret → processo aborta no boot); em dev, warning + fallback. `.env.example` ganha `PORT`, `HOST`, `JWT_SECRET`, `NODE_ENV`.
- `GET /api/settlements/:id` passa a exigir autenticação.

## 9. Correções menores

- Toast: id por contador incremental (Date.now() colide e derruba dois toasts).
- Questionários `synced` abrem em **modo leitura** na `SurveyPage` (inputs desabilitados, sem botão finalizar) em vez do `Link to="#"` morto.

## 10. Features novas

### 10.1 Exportação CSV (admin)
- `GET /api/admin/export.csv` (JWT admin): uma linha por questionário sincronizado; colunas: `id, client_id, assentamento, municipio, bioma, entrevistador, email_entrevistador, lote, gps_lat, gps_lng, criado_em, concluido_em, sincronizado_em` + uma coluna por pergunta (ordem `sortOrder`, header = `key`) + coluna `<key>_texto` para perguntas com `hasTextInput`. Múltipla escolha: valores unidos por `;`. Filtro opcional `?settlementId=`.
- Formato Excel pt-BR: UTF-8 **com BOM**, delimitador `;`, escaping RFC 4180. Montagem: função pura `buildCsv(rows, questions)` (testável) + rota que junta surveys/responses/settlements/users.
- Admin (aba Geral): botão "Exportar CSV" → `fetch` com Authorization → blob → download `resa-survey-YYYY-MM-DD.csv`.

### 10.2 Visualização de respostas no admin
- Na aba Geral, clicar num questionário abre sheet/modal com: metadata (assentamento, lote, entrevistador, GPS, datas) + todas as respostas com **texto da pergunta e label da opção** (lookup em `/admin/questions`), incluindo `textValue`. Usa `GET /api/surveys/:id` existente.

## 11. Testes (infra mínima)

- Vitest nos workspaces com lógica pura testável; `turbo test` já está wired.
- Cobertos: cálculo de progresso/aplicabilidade (web — extraído para `lib/progress.ts`), decisão de marcação pós-sync (web — função pura em `lib/sync.ts` extraída), `buildCsv` (server), normalização de payload do sync (server — schema zod).
- Sem testes de integração com Postgres/IndexedDB nesta fase (verificação manual via smoke test local).

## 12. Verificação

1. `npm run build` (typecheck completo) + `npm run test`.
2. Smoke local se Postgres disponível: migrate + seed + curl login/sync (payload duplicado → sem duplicata; payload com erro → não marca synced).
3. Fluxo no navegador (dev server): criar questionário, responder "Outro", recarregar (persistência), finalizar com pendências (confirmação), sync manual.

## 13. Deploy (VPS)

Após merge: `git pull && npm install && npm run build`, aplicar migração (`npm run db:push -w @resa/server` ou SQL do drizzle/), `pm2 restart resa-server`. **Não executado por este plano** — documentado apenas.
