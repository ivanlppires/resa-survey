# Questionário v2 (versionado) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app passa a coletar com o questionário revisado (v2) e as 15 entrevistas já sincronizadas ficam arquivadas como v1, consultáveis e exportáveis com as perguntas originais.

**Architecture:** `questions.version` e `surveys.questionnaire_version` (default 1) versionam o instrumento; a v2 entra com chaves `v2_*` e é carregada no boot por um passo "inserir versões que faltam". API, export, painel e PWA filtram por versão; `GET /api/questions` sem parâmetro fica fixo na v1 para o PWA antigo em cache.

**Tech Stack:** TypeScript ESM, Fastify 5 + Zod + Drizzle/postgres-js, React 19 + Vite + Tailwind 4 + Dexie, Vitest.

**Spec:** `docs/plans/2026-11-20-questionario-v2-design.md` — leia antes de qualquer tarefa. Fonte do conteúdo da v2: `docs/Questionario_Socioeconomico_revisado.docx` (`pandoc <docx> -t plain --wrap=none`).

## Global Constraints

- Branch `feat/questionario-v2`; nunca commitar em `master`. Entrega por PR para `master`.
- Nada da v1 muda: chaves, textos, alternativas, `sortOrder` e colunas do export idênticos aos de hoje.
- Nunca apagar nem atualizar linhas de `questions` em carga automática; nunca recusar nem apagar dado de campo (sync e Dexie).
- Chaves v2: prefixo `v2_`, snake_case sem acento, ≤ 50 caracteres. `value` das alternativas: snake_case sem acento.
- `GET /api/questions` sem parâmetro devolve **array** de perguntas v1 ativas, formato atual.
- Versão vigente = `max(version)` em `questions`.
- Servidor e shared: imports relativos com `.js`. Após editar `packages/shared`, rodar `npm run build -w @resa/shared`.
- UI e mensagens em pt-BR; visual segue os componentes existentes de `SurveyPage.tsx`/`AdminDashboardPage.tsx`.
- `docs/resa-survey-2026-11-05.xlsx` não é commitado (dados de entrevistas).
- Comandos a partir da raiz do repo. Postgres local: container `eleicoes_postgres`, porta 5433, role `resa`.
- Commits terminam com `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. Sync de entrevista **sem respostas e sem `questionnaireVersion`** (PWA antigo) → gravada como v1, não como vigente. (Tarefa 3)
2. Sync com **chave de resposta desconhecida** (pergunta inexistente) → entrevista gravada; a chave desconhecida é ignorada no cálculo da versão. (Tarefa 3)
3. Boot com a **v2 parcialmente presente** (ex.: uma pergunta `version 2` criada à mão) → carga não insere nada dessa versão e não derruba o boot. (Tarefa 2)
4. Marcar alternativa **exclusiva quando "Outro" tem texto** → texto do "Outro" é descartado junto com a marcação. (Tarefa 6)
5. Abrir **rascunho v1 sem perguntas v1 no cache e sem rede** → mensagem para conectar; nunca mostrar perguntas de outra versão nem tela vazia com botão de finalizar. (Tarefas 5 e 6)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/shared/src/survey-schema.ts`, `sync-types.ts` | campos novos nos tipos |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/0003_*.sql` | colunas novas |
| `apps/server/src/db/questionnaires/v1.ts`, `v2.ts`, `index.ts` | conteúdo das versões |
| `apps/server/src/db/ensure-questionnaires.ts` | carga "inserir versões que faltam" |
| `apps/server/src/db/seed.ts`, `docker-entrypoint.sh` | chamam a carga em todo boot |
| `apps/server/src/lib/questionnaire-version.ts` | versão vigente e derivação da versão no sync |
| `apps/server/src/routes/questions.ts`, `surveys.ts`, `sync-schema.ts`, `export.ts` | API por versão |
| `apps/server/src/lib/pdf-report.ts` | quadros agrupados no PDF |
| `apps/web/src/lib/db.ts`, `sync.ts`, `sync-helpers.ts` | cache e payload versionados |
| `apps/web/src/lib/questionnaire.ts` (novo) | lógica pura: versões, itens/quadros, marcação |
| `apps/web/src/lib/progress.ts` | progresso contando quadro como uma pergunta |
| `apps/web/src/pages/SurveyPage.tsx`, `NewSurveyPage.tsx` | coleta v2 |
| `apps/web/src/pages/AdminDashboardPage.tsx` | seletor de versão, arquivo somente leitura |

---

### Task 1: Tipos compartilhados, schema e migração

**Files:**
- Modify: `packages/shared/src/survey-schema.ts`, `packages/shared/src/sync-types.ts`
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0003_*.sql` (gerado)

**Interfaces — Produces:**
- `QuestionOption.exclusive?: boolean`
- `Question` e `QuestionRecord` ganham `version: number`, `groupKey: string | null`, `groupText: string | null`, `subsection: string | null`, `maxSelections: number | null`
- `SyncSurveyMetadata.questionnaireVersion?: number`
- Drizzle: `questions.version` (`integer('version').notNull().default(1)`), `questions.groupKey` (`varchar('group_key', { length: 50 })`), `questions.groupText` (`text('group_text')`), `questions.subsection` (`text('subsection')`), `questions.maxSelections` (`integer('max_selections')`), `surveys.questionnaireVersion` (`integer('questionnaire_version').notNull().default(1)`); tipo de `options` inclui `exclusive?: boolean`.

- [ ] **Step 1:** Editar os tipos em `packages/shared` e o schema Drizzle conforme acima.
- [ ] **Step 2:** `npm run build -w @resa/shared && npm run db:generate -w @resa/server`. Esperado: novo `0003_*.sql` contendo apenas `ALTER TABLE ... ADD COLUMN` (6 colunas), sem `DROP`.
- [ ] **Step 3:** Aplicar no banco local (`npx tsx src/db/migrate.ts` em `apps/server`) e conferir: `select count(*) from questions where version=1` = total de perguntas; `select count(*) from surveys where questionnaire_version<>1` = 0.
- [ ] **Step 4:** `npm run build`. Esperado: todos os workspaces compilam (ajustar literais de tipo que quebrarem em `apps/web/src/lib/db.ts` só o mínimo; o resto é da Tarefa 5).
- [ ] **Step 5:** Commit `feat(db): versão do questionário em perguntas e entrevistas`.

---

### Task 2: Conteúdo v1/v2 e carga das versões

**Files:**
- Create: `apps/server/src/db/questionnaires/v1.ts`, `v2.ts`, `index.ts`, `questionnaires.test.ts`
- Create: `apps/server/src/db/ensure-questionnaires.ts`, `ensure-questionnaires.test.ts`
- Modify: `apps/server/src/db/seed.ts`, `docker-entrypoint.sh`
- Add to git: `docs/Questionario_Socioeconomico_revisado.docx`

**Interfaces — Produces:**
- `type QuestionSeed = typeof questions.$inferInsert`
- `v1.ts`: `export const questionsV1: QuestionSeed[]` · `v2.ts`: `export const questionsV2: QuestionSeed[]`
- `index.ts`: `export const questionnaires: Record<number, QuestionSeed[]>` (`{ 1: questionsV1, 2: questionsV2 }`)
- `ensure-questionnaires.ts`:
  - `versionsToInsert(existingVersions: number[], definedVersions: number[]): number[]` — definidas que não aparecem em `existingVersions`, em ordem crescente.
  - `ensureQuestionnaires(db): Promise<number[]>` — lê `select distinct version`, insere por inteiro (em transação) cada versão que falta, devolve as inseridas. Nunca `delete`/`update`.

**Regras de transcrição da v2** (spec §2 e §3, com os ajustes aprovados das perguntas 26/26b e 46):
- 74 linhas; `version: 2`; `sortOrder` 1..74 na ordem do documento; `number` = número do documento (sem 13 e 37; 26b tem `number: 26`).
- `section`: 01–30 `socioeconomic`, 31–39 `behavioral`, 40–50 `environmental`.
- `subsection` só na Parte I, texto exato: "A. Família e trabalho" (01–06), "B. Renda" (07–11), "C. Terra" (12–15), "D. Produção e comercialização" (16–21), "E. Gestão, apoio e crédito" (22–26b), "F. Condições de vida e perspectivas" (27–30).
- `text` e `label` idênticos ao documento, sem a instrução entre parênteses ("marque apenas uma" etc.). Na 50, manter "(1 = nenhuma mudança; 5 = muitas mudanças)" no texto.
- Quadros: `groupKey` `v2_q16_produtos` (12 linhas, `multiple_choice`, opções `consumo`/`venda`; a linha "Outro" tem `hasTextInput: true` nas duas opções), `v2_q27_servicos` (6 linhas, `single_choice`, `bom`/`regular`/`ruim`/`nao_tem`), `v2_q38_afirmacoes` (10 linhas, `single_choice`, `sim`/`em_parte`/`nao`; `text` sem o prefixo "a)"). `groupText` = enunciado do quadro; `text` = rótulo da linha.
- `v2_q30_*`: `maxSelections: 3`. `v2_q50_*`: `scale`, 1–5.
- `v2_q26b_*`: `conditional: { dependsOn: <chave da 26>, showWhen: [<values das duas alternativas "Sim">] }`.
- `exclusive: true` conforme a lista do spec §2.

- [ ] **Step 1: Testes que falham** — `questionnaires.test.ts`:

```ts
it('v1 preserva as 70 perguntas originais', () => {
  expect(questionsV1).toHaveLength(70)
  expect(questionsV1.every((q) => (q.version ?? 1) === 1)).toBe(true)
  expect(questionsV1.map((q) => q.key)).toMatchSnapshot()
  expect(questionsV1).toMatchSnapshot() // gerado ANTES de mover o conteúdo, a partir do seed.ts atual
})
it('v2 tem a forma do documento revisado', () => {
  expect(questionsV2).toHaveLength(74)
  expect(questionsV2.every((q) => q.version === 2 && q.key.startsWith('v2_') && q.key.length <= 50)).toBe(true)
  expect(new Set(questionsV2.map((q) => q.key)).size).toBe(74)
  expect(questionsV2.map((q) => q.sortOrder)).toEqual(Array.from({ length: 74 }, (_, i) => i + 1))
  const numbers = [...new Set(questionsV2.map((q) => q.number))]
  expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => n !== 13 && n !== 37))
  const groupSize = (k: string) => questionsV2.filter((q) => q.groupKey === k).length
  expect([groupSize('v2_q16_produtos'), groupSize('v2_q27_servicos'), groupSize('v2_q38_afirmacoes')]).toEqual([12, 6, 10])
  expect(questionsV2.filter((q) => q.maxSelections != null).map((q) => [q.number, q.maxSelections])).toEqual([[30, 3]])
  expect(questionsV2.filter((q) => q.conditional).map((q) => q.number)).toEqual([26])
  expect(questionsV2.filter((q) => q.type === 'scale').map((q) => q.number)).toEqual([50])
})
it('v2: seções, exclusivas e ajustes aprovados', () => {
  // seção por faixa de número (1–30, 31–39, 40–50)
  // exclusive só aparece em multiple_choice
  // labels da 46 === ['Não','Sim, até 2 ha','Sim, mais de 2 até 5 ha','Sim, mais de 5 até 10 ha','Sim, mais de 10 ha','Não sabe informar']
  // 26: 4 alternativas, as duas "Nunca utilizou…" exclusivas; 26b: labels ['Custeio','Investimento ou infraestrutura'],
  //     conditional.dependsOn = chave da 26 e showWhen ⊂ values da 26
  // nenhum label contém "marque"; toda opção cujo label começa com "Outro"/"Outra" tem hasTextInput
})
it('chaves v1 e v2 não colidem', () => { /* interseção vazia */ })
```

  `ensure-questionnaires.test.ts`: `versionsToInsert([], [1, 2])` → `[1, 2]`; `([1], [1, 2])` → `[2]`; `([1, 2], [1, 2])` → `[]`; `([2], [1, 2])` → `[1]`; `([1, 2, 2], [1, 2])` → `[]` (v2 parcial = presente).

- [ ] **Step 2:** Gerar o snapshot da v1 a partir do `seed.ts` **atual** (teste temporário importando o array antes de movê-lo) e só então mover o conteúdo para `v1.ts` sem editar. `npm run test -w @resa/server` → falha só nos testes da v2 e da carga.
- [ ] **Step 3:** Escrever `v2.ts` transcrevendo o documento pelas regras acima.
- [ ] **Step 4:** Implementar `ensure-questionnaires.ts`. `seed.ts`: remover `delete(questions)`, o array e o ramo `SEED_ONLY_IF_EMPTY`; chamar `ensureQuestionnaires` e logar as versões inseridas; manter a criação dos usuários iniciais só se não existirem. `docker-entrypoint.sh`: rodar `node dist/db/seed.js` sem `SEED_ONLY_IF_EMPTY`; se falhar, imprimir `[entrypoint] ERRO na carga do questionário` e seguir o boot (o servidor sobe com o que já existe).
- [ ] **Step 5:** `npm run test -w @resa/server` → passa. No banco local: `npm run db:seed -w @resa/server` duas vezes; esperado `70` linhas v1 e `74` v2 após a primeira e nenhuma inserção na segunda.
- [ ] **Step 6:** Commit `feat(questionario): conteúdo v2 e carga idempotente das versões` (inclui o `.docx`).

---

### Task 3: API de perguntas, entrevistas e sync por versão

**Files:**
- Create: `apps/server/src/lib/questionnaire-version.ts`, `questionnaire-version.test.ts`
- Modify: `apps/server/src/routes/questions.ts`, `surveys.ts`, `sync-schema.ts`, `sync-schema.test.ts`

**Interfaces:**
- Consumes: colunas da Tarefa 1.
- Produces:
  - `deriveQuestionnaireVersion(responseKeys: string[], versionByKey: Map<string, number>, payloadVersion?: number): { version: number; mixed: boolean }` — versão com mais chaves conhecidas (empate → a maior); sem chave conhecida → `payloadVersion ?? 1`; `mixed` = mais de uma versão entre as chaves conhecidas.
  - `getCurrentVersion(db): Promise<number>` — `max(version)`, 1 se vazio.
  - `GET /api/questions` → v1 ativas (array). `GET /api/questions?version=current|N` → ativas daquela versão (array, ordenado por `sortOrder`); `version` inválido → 400.
  - `PUT`/`DELETE /api/admin/questions/:id` de pergunta com `version < vigente` → `409 { error: 'Pergunta de versão arquivada é somente leitura' }`. `POST` aceita os campos novos e `version` (default vigente).
  - `syncPayloadSchema`: `metadata.questionnaireVersion: z.number().int().positive().optional()`.
  - `POST /api/sync` grava `questionnaireVersion` derivado; se `mixed`, `request.log.warn` com `localId`.

- [ ] **Step 1: Testes que falham** — `questionnaire-version.test.ts`, com `m = new Map([['q01_idade', 1], ['v2_q01_idade', 2], ['v2_q02_escolaridade', 2]])`:

```ts
expect(deriveQuestionnaireVersion(['q01_idade'], m)).toEqual({ version: 1, mixed: false })
expect(deriveQuestionnaireVersion(['v2_q01_idade'], m, 1)).toEqual({ version: 2, mixed: false })   // chaves vencem o payload
expect(deriveQuestionnaireVersion([], m)).toEqual({ version: 1, mixed: false })                      // PWA antigo, sem respostas
expect(deriveQuestionnaireVersion([], m, 2)).toEqual({ version: 2, mixed: false })
expect(deriveQuestionnaireVersion(['desconhecida'], m)).toEqual({ version: 1, mixed: false })
expect(deriveQuestionnaireVersion(['desconhecida', 'v2_q01_idade'], m)).toEqual({ version: 2, mixed: false })
expect(deriveQuestionnaireVersion(['q01_idade', 'v2_q01_idade', 'v2_q02_escolaridade'], m)).toEqual({ version: 2, mixed: true })
expect(deriveQuestionnaireVersion(['q01_idade', 'v2_q01_idade'], m)).toEqual({ version: 2, mixed: true }) // empate → maior
```

  Em `sync-schema.test.ts`: payload sem `questionnaireVersion` é válido; com `2` é válido; com `'2'` ou `0` é rejeitado.

- [ ] **Step 2:** `npm run test -w @resa/server` → falha.
- [ ] **Step 3:** Implementar a lib e as rotas. No sync, carregar `key → version` uma vez por requisição.
- [ ] **Step 4:** `npm run test -w @resa/server` → passa. Com o servidor local: `curl /api/questions | jq 'length, (map(.version)|unique)'` → `70`, `[1]`; `?version=current` → `74`, `[2]`; `?version=abc` → 400.
- [ ] **Step 5:** Commit `feat(api): perguntas e sync por versão do questionário`.

---

### Task 4: Export por versão e quadros no PDF

**Files:**
- Modify: `apps/server/src/routes/export.ts`, `apps/server/src/lib/pdf-report.ts`
- Create/Modify: `apps/server/src/lib/csv.test.ts`, `pdf.test.ts`, `apps/server/src/routes/export-version.test.ts`

**Interfaces:**
- Consumes: `getCurrentVersion` (Tarefa 3), `questionsV1` (Tarefa 2).
- Produces:
  - `resolveExportVersion(input: { version?: number; surveyVersion?: number; current: number }): number` em `export.ts` — `surveyVersion ?? version ?? current`.
  - Query do export: `version: z.coerce.number().int().positive().optional()`. Perguntas e entrevistas filtradas pela versão resolvida. `surveyId` inexistente → 404.
  - `filenameBase` → `resa-survey-v{N}-{data}` e `resa-entrevista-{id}-v{N}-{data}`.
  - `PdfQuestion` ganha `groupKey: string | null`, `groupText: string | null`; no PDF, linhas de um quadro saem sob um único título `{number}. {groupText}`, cada linha como `{text}: {resposta}`.

- [ ] **Step 1: Testes que falham:**
  - `csv.test.ts` "export v1 mantém as colunas de hoje": montar `CsvQuestion[]` a partir de `questionsV1` e comparar `buildTable(...).header` com snapshot inline gerado no commit base (`master`) — 13 colunas de metadados + chaves v1 na ordem, com `_texto` onde há `hasTextInput`. Nenhuma coluna `v2_`.
  - `export-version.test.ts`: `resolveExportVersion({ current: 2 })` → 2; `({ version: 1, current: 2 })` → 1; `({ version: 1, surveyVersion: 2, current: 2 })` → 2.
  - `pdf.test.ts`: relatório com duas linhas do mesmo `groupKey` contém o `groupText` uma única vez e os dois rótulos de linha.
- [ ] **Step 2:** `npm run test -w @resa/server` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm run test -w @resa/server` → passa.
- [ ] **Step 5:** Commit `feat(export): exportação por versão do questionário`.

---

### Task 5: Cache e sincronização versionados no PWA

**Files:**
- Create: `apps/web/src/lib/questionnaire.ts`, `questionnaire.test.ts`
- Modify: `apps/web/src/lib/db.ts`, `sync.ts`, `sync-helpers.ts`, `sync-helpers.test.ts`, `apps/web/src/pages/NewSurveyPage.tsx`

**Interfaces:**
- Consumes: `GET /api/questions?version=current|N` (Tarefa 3).
- Produces:
  - `LocalQuestion` ganha `version: number`, `groupKey`, `groupText`, `subsection`, `maxSelections` (todos `| null` exceto `version`) e `exclusive?: boolean` nas opções. `LocalSurvey.questionnaireVersion: number`.
  - Dexie `db.version(3)`: `questions: 'id, key, section, sortOrder, version'` + `upgrade` que aplica `inferSurveyVersion` às entrevistas e `version ??= 1` às perguntas.
  - `questionnaire.ts` (puro):
    - `inferSurveyVersion(responseKeys: string[], fallback: number): number` — alguma chave `v2_` → 2; há chaves e nenhuma `v2_` → 1; sem chaves → `fallback`.
    - `versionsToKeep(surveys: { status: string; questionnaireVersion: number }[], current: number): Set<number>` — `current` + versões de entrevistas com status ≠ `synced`.
  - `sync.ts`:
    - `syncQuestions(): Promise<void>` — busca `?version=current`; em sucesso, numa transação, remove do cache as perguntas cuja versão não está em `versionsToKeep` e substitui as da versão recebida. Falha de rede → cache intacto.
    - `getCurrentCachedVersion(): Promise<number | null>` — maior `version` no cache.
    - `getQuestionsForVersion(version: number): Promise<LocalQuestion[]>` — do cache, por `sortOrder`; se vazio, tenta `?version=N`, guarda e devolve; sem rede → `[]`.
    - `getQuestions` é removida (único uso é `SurveyPage`, trocado na Tarefa 6).
  - `buildSyncPayload` envia `metadata.questionnaireVersion`.
  - `NewSurveyPage`: garante perguntas (`syncQuestions` se cache vazio) e grava `questionnaireVersion = getCurrentCachedVersion()`; se `null` (sem cache e sem rede), não cria e mostra "Conecte-se à internet para baixar o questionário antes da primeira entrevista."

- [ ] **Step 1: Testes que falham** — `questionnaire.test.ts`:

```ts
expect(inferSurveyVersion(['q01_idade', 'q02_escolaridade'], 2)).toBe(1)
expect(inferSurveyVersion(['v2_q01_idade'], 1)).toBe(2)
expect(inferSurveyVersion([], 2)).toBe(2)
expect(inferSurveyVersion([], 1)).toBe(1)
expect([...versionsToKeep([{ status: 'in_progress', questionnaireVersion: 1 }, { status: 'synced', questionnaireVersion: 1 }], 2)].sort()).toEqual([1, 2])
expect([...versionsToKeep([{ status: 'synced', questionnaireVersion: 1 }], 2)]).toEqual([2])
expect([...versionsToKeep([{ status: 'completed', questionnaireVersion: 1 }], 2)].sort()).toEqual([1, 2])
```

  `sync-helpers.test.ts`: `buildSyncPayload` inclui `questionnaireVersion` de cada entrevista.

- [ ] **Step 2:** `npm run test -w @resa/web` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm run test -w @resa/web && npm run build` → passa (o `SurveyPage` pode usar `getQuestionsForVersion(survey.questionnaireVersion)` de forma mínima para compilar).
- [ ] **Step 5:** Commit `feat(pwa): cache de perguntas e sync por versão`.

---

### Task 6: Tela de coleta v2 (quadros, exclusivas, limite, subtítulos)

**Files:**
- Modify: `apps/web/src/lib/questionnaire.ts`, `questionnaire.test.ts`, `apps/web/src/lib/progress.ts`, `progress.test.ts`, `apps/web/src/pages/SurveyPage.tsx`

**Interfaces:**
- Consumes: `getQuestionsForVersion`, tipos da Tarefa 5.
- Produces (em `questionnaire.ts`):
  - `type SurveyItem = { kind: 'question'; question: LocalQuestion } | { kind: 'group'; groupKey: string; number: number; text: string; rows: LocalQuestion[] }`
  - `buildItems(questions: LocalQuestion[]): SurveyItem[]` — linhas consecutivas com o mesmo `groupKey` viram um item `group` (`text` = `groupText`); ordem preservada.
  - `toggleOption(current: string[], optValue: string, options: { value: string; exclusive?: boolean }[], maxSelections: number | null): string[]` — desmarcar sempre permitido; marcar exclusiva → `[optValue]`; marcar não exclusiva remove exclusivas marcadas; no limite, marcar outra devolve `current` inalterado.
- `progress.ts`: `ProgressQuestion` ganha `groupKey?: string | null` e `type?: string`. `computeProgress` e `unansweredBySection` contam cada quadro como **uma** pergunta: respondido quando todas as linhas aplicáveis têm resposta; se as linhas são `multiple_choice` (quadro 16), quando ao menos uma tem. Perguntas sem `groupKey`: comportamento atual.

**Comportamento da tela:**
- Carrega `getQuestionsForVersion(survey.questionnaireVersion)`. Lista vazia → cartão "Conecte-se à internet para baixar as perguntas desta entrevista." e **sem** botão Finalizar.
- Quadro: um cartão, "Pergunta N" e o enunciado uma vez; cada linha com o rótulo e os botões das alternativas lado a lado (quebram linha em tela estreita). Na linha "Outro" da 16, o campo "Especifique..." aparece quando há alguma marcação na linha.
- `subsection`: cabeçalho antes do primeiro item de cada subseção.
- Múltipla escolha usa `toggleOption`; se a alternativa com texto deixa de estar marcada, o `textValue` é descartado (regra já existente em `MultipleChoice`). Com `maxSelections`, legenda "Marque até N" e alternativas não marcadas desabilitadas ao atingir o limite.
- Entrevistas v1 (rascunho ou leitura) seguem renderizando como hoje.

- [ ] **Step 1: Testes que falham:**

```ts
const opts = [{ value: 'nenhuma', exclusive: true }, { value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }]
expect(toggleOption(['a', 'b'], 'nenhuma', opts, null)).toEqual(['nenhuma'])
expect(toggleOption(['nenhuma'], 'a', opts, null)).toEqual(['a'])
expect(toggleOption(['a'], 'a', opts, null)).toEqual([])
expect(toggleOption(['a', 'b', 'c'], 'd', opts, 3)).toEqual(['a', 'b', 'c'])
expect(toggleOption(['a', 'b', 'c'], 'c', opts, 3)).toEqual(['a', 'b'])
expect(toggleOption(['a', 'b', 'c'], 'nenhuma', opts, 3)).toEqual(['nenhuma'])
// buildItems: [q1, g(a), g(b), q2] → kinds ['question','group','question'], rows do grupo = 2, text = groupText
// progress: quadro single_choice de 3 linhas com 2 respondidas → conta como 1 não respondida; com 3 → respondida
// progress: quadro multiple_choice de 3 linhas com 1 marcada → respondida; com 0 → 1 não respondida
// progress: v1 (sem groupKey) → mesmos números dos testes atuais
```

- [ ] **Step 2:** `npm run test -w @resa/web` → falha.
- [ ] **Step 3:** Implementar helpers, progresso e a tela.
- [ ] **Step 4:** `npm run test -w @resa/web && npm run build` → passa.
- [ ] **Step 5: Verificação no navegador** (`npm run dev`, login de entrevistador, viewport de celular): nova entrevista mostra os 48 itens na ordem do documento; quadros 16/27/38; limite da 30; exclusivas; 26b aparece só com "Sim" na 26; finalizar com tudo respondido não acusa pendências; sincroniza. Conferir no banco: `questionnaire_version = 2` e chaves `v2_*`. Simular rascunho v1 sem perguntas v1 no cache e offline (DevTools): aparece a mensagem de conectar, sem botão Finalizar.
- [ ] **Step 6:** Commit `feat(pwa): coleta com o questionário revisado (v2)`.

---

### Task 7: Painel — seletor de versão e arquivo somente leitura

**Files:**
- Modify: `apps/web/src/pages/AdminDashboardPage.tsx`

**Interfaces — Consumes:** `questionnaireVersion` em `/api/surveys*`, `version` em `/api/admin/questions`, parâmetro `version` do export, 409 das perguntas arquivadas.

**Comportamento:**
- `Question` local ganha `version`, `groupKey`, `groupText`; `SurveyOverview` ganha `questionnaireVersion`.
- Versões disponíveis = versões distintas das perguntas; vigente = a maior. Um componente `VersionSwitch` (controle segmentado no estilo do existente) com rótulos "Questionário revisado (v2)" e "Arquivo (v1)"; padrão = vigente. Só aparece se houver mais de uma versão.
- Visão geral: totais e lista filtrados pela versão; export chama `/api/admin/export.{fmt}?version={N}` com nome `resa-survey-v{N}-{data}`.
- Detalhe da entrevista: usa a versão da própria entrevista; linhas de quadro agrupadas sob o `groupText`, cada linha "rótulo: resposta". Export individual com `-v{N}` no nome.
- Aba Perguntas: mesmo seletor; contagem "X ativas de Y" da versão; em versão arquivada, sem editar/desativar/reativar e com o rótulo "Arquivo — somente leitura".

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run build` → passa.
- [ ] **Step 3: Verificação no navegador** (admin, banco local com a restauração da Tarefa 8 ou dados de teste v1+v2): alternar versões muda totais, lista e perguntas; detalhe de entrevista v1 mostra textos v1; os três exports baixam nas duas versões; perguntas v1 sem botões de edição.
- [ ] **Step 4:** Commit `feat(admin): seletor de versão e arquivo v1 somente leitura`.

---

### Task 8: Regressão com dados de produção, docs e PR

**Files:**
- Modify: `CLAUDE.md` (seção de arquitetura: versões do questionário, `questionnaires/`, rota fixa em v1, seed idempotente; trocar "68-question survey")

- [ ] **Step 1:** Em `master`, restaurar um dump de produção num banco local descartável (`resa_survey_v2check`) e baixar o export v1 atual (`export.csv`) → `antes.csv` no scratchpad (fora do repo).
- [ ] **Step 2:** Na branch, apontar para o mesmo banco, rodar migração + seed, subir o servidor e baixar `export.csv?version=1` → `depois.csv`. `diff antes.csv depois.csv` → vazio. Conferir: 15 entrevistas com `questionnaire_version = 1`; 70 perguntas v1 + 74 v2; 905 respostas.
- [ ] **Step 3:** No mesmo banco: `curl /api/questions` (sem parâmetro) → 70 perguntas v1.
- [ ] **Step 4:** `npm run test && npm run build` → tudo passa. Atualizar `CLAUDE.md`. Apagar o banco descartável.
- [ ] **Step 5:** Commit `docs: questionário versionado no CLAUDE.md`; `git push -u origin feat/questionario-v2`; `gh pr create --base master` com resumo, evidências dos passos 2–3 e o checklist de implantação do spec §7.

**Implantação (depois do PR aprovado; cada passo confirmado com o Ivan):** dump manual de produção → merge → deploy no Coolify → conferência do spec §7.3 (contagens, export v1 igual ao de antes, entrevista de teste v2 de ponta a ponta e sua exclusão).
