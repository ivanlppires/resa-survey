# Questionário revisado (versão 2) com arquivo da versão 1 — design

Data: 2026-11-20 · Branch: `feat/questionario-v2`

## Intenção

A equipe da pesquisa revisou o instrumento de coleta. O novo texto está em
`docs/Questionario_Socioeconomico_revisado.docx` (48 itens, numerados de 01 a 50,
sem os números 13 e 37). O app precisa passar a coletar com o instrumento novo
**sem perder as 15 entrevistas já sincronizadas em produção** (10–11/08/2026,
905 respostas, feitas com as 70 perguntas atuais).

Decisão do Ivan: as entrevistas antigas ficam **arquivadas, consultáveis e
exportáveis** com o questionário original. Não serão convertidas para o
instrumento novo.

## Objetivos

1. Coleta nova usa só o questionário revisado, fiel ao documento (texto,
   alternativas, numeração, ordem).
2. As 15 entrevistas antigas continuam visíveis no painel e exportáveis em CSV,
   Excel e PDF, com as perguntas e alternativas originais.
3. Cada entrevista sabe com qual versão do questionário foi feita.
4. Nenhum dado de campo ainda não sincronizado em celular é perdido ou
   misturado na troca.

## Fora do escopo

- Converter/harmonizar respostas v1 para v2.
- Tela de administração para criar versões novas (a v3, se existir, entra por
  código como a v2).
- Mostrar no app o texto de apresentação/sigilo do documento.
- Os campos de cabeçalho do papel (local, data, entrevistador, assentamento):
  já são cobertos pelos metadados da entrevista.

## O que seria fracasso mesmo "funcionando"

- Qualquer resposta antiga exibida ou exportada com texto/alternativa da v2.
- O export da v1 mudar de colunas ou valores em relação ao de hoje.
- Uma entrevista com respostas de duas versões misturadas.
- Rascunho ou entrevista concluída e não sincronizada sumir do celular.

## Como funciona hoje (o que a mudança toca)

- `questions` (Postgres) tem `key` UNIQUE; `responses.question_key` guarda só a
  chave, sem FK. O significado de uma resposta depende da pergunta que hoje tem
  aquela chave.
- `seed.ts` apaga todas as perguntas e reinsere; em produção o entrypoint roda
  o seed só com o banco vazio (`SEED_ONLY_IF_EMPTY=1`), então **o seed sozinho
  não leva perguntas novas para produção**.
- `GET /api/questions` devolve um array das perguntas ativas; o PWA faz
  `db.questions.clear()` + `bulkAdd` (guarda o objeto inteiro que vem da API).
- Export (`routes/export.ts`) monta colunas com todas as perguntas da tabela.
- Painel (`AdminDashboardPage.tsx`) resolve texto/rótulo por `key`.
- Tipos de pergunta: `single_choice`, `multiple_choice`, `yes_no`, `scale`,
  `text`. Não existe quadro (matriz), limite de marcações nem alternativa
  exclusiva.

## Abordagens consideradas

- **A. Questionário versionado (escolhida pelo Ivan).** Perguntas e entrevistas
  ganham número de versão; v1 fica intacta, v2 entra com chaves próprias;
  painel e export filtram por versão. Custa uma migração e ajustes em painel,
  export e app, mas mantém o arquivo legível e aguenta revisões futuras.
- **B. Só desativar as antigas e inserir as novas.** Mais rápido, porém nada
  liga a entrevista ao instrumento; export com ~120 colunas meio vazias e
  totais do painel misturando os dois instrumentos.
- **C. Exportar as antigas para arquivo e limpar o banco.** Descartada: deixam
  de ser consultáveis no sistema.

## Design

### 1. Modelo de dados

Migração Drizzle (aditiva, sem apagar nada):

- `questions.version integer NOT NULL DEFAULT 1` — as 70 linhas atuais viram v1.
- `surveys.questionnaire_version integer NOT NULL DEFAULT 1` — as 15
  entrevistas viram v1.
- `questions.group_key varchar(50) NULL` e `questions.group_text text NULL` —
  identificam as linhas de um quadro (ver §3). `text` da linha é o rótulo da
  linha; `group_text` é o enunciado do quadro.
- `questions.subsection text NULL` — subtítulos da Parte I ("A. Família e
  trabalho" … "F. Condições de vida e perspectivas").
- `questions.max_selections integer NULL` — limite de marcações (pergunta 30 = 3).
- Em `options` (jsonb, sem migração): novo campo opcional `exclusive: true`.

`questions.key` continua UNIQUE global. As chaves da v2 levam prefixo `v2_`
(`v2_q01_idade`, `v2_q16_mandioca`, `v2_q38a_ganho_garantido`), então
`responses.question_key` segue sem ambiguidade e nada na v1 é renomeado.

**Versão vigente** = maior `version` existente em `questions`. `active`
mantém o sentido atual (desativar uma pergunta dentro da sua versão).

Os três lugares alinhados: schema Drizzle, tipos em `packages/shared`, tipos e
versão do Dexie em `apps/web/src/lib/db.ts`.

### 2. Conteúdo e carga das versões

- O conteúdo das perguntas sai de `seed.ts` para dois arquivos de dados:
  `questionnaires/v1.ts` (as 70 atuais, **sem alterar um caractere** além de
  `version: 1`) e `questionnaires/v2.ts`. Conferido em 20/11/2026: as 70
  perguntas de produção são idênticas às do `seed.ts` (texto, alternativas,
  ordem; todas ativas), então o `seed.ts` é fonte fiel da v1. São 70 linhas
  para 68 números porque 20b e 52b são condicionais.
- O seed deixa de fazer `delete(questions)`. Passa a ser "inserir as versões
  que faltam": para cada versão do código, se não há nenhuma linha com aquela
  `version`, insere todas; se já há, não toca. Nunca apaga nem atualiza.
- O entrypoint roda esse passo em todo boot (substitui o
  `SEED_ONLY_IF_EMPTY`). É assim que a v2 chega à produção. Usuário admin
  inicial continua sendo criado só se não existir.
- `docs/Questionario_Socioeconomico_revisado.docx` é commitado como fonte.
  `docs/resa-survey-2026-11-05.xlsx` **não** é commitado (contém dados de
  entrevistas); serve de referência local para o teste de regressão do export.

**Transcrição da v2** (74 linhas no banco: 46 perguntas simples, incluindo a 26b, + 12 + 6 + 10
linhas de quadros):

- Fiel ao documento, inclusive a numeração com saltos (sem 13 e 37) — decisão
  minha, para o app bater com o papel.
- Seções: Parte I → `socioeconomic` (01–30), Parte II → `behavioral` (31–39),
  Parte III → `environmental` (40–50).
- "marque apenas uma" / "marque a principal" / "marque o principal critério" →
  `single_choice`; "marque todas que se aplicam" → `multiple_choice`;
  "marque até 3" → `multiple_choice` com `max_selections = 3`; pergunta 50 →
  `scale` 1–5.
- "Outro/Outra: ____" → opção com `hasTextInput` (texto em `textValue`, como hoje).
- Alternativas exclusivas (`exclusive: true`) — decisão minha: toda alternativa
  de negação/ausência em pergunta de múltipla escolha: "Nenhum(a)", "Não
  utiliza", "Não participa", "Não comercializa", "Não se aplica…", "Não observa
  problemas", "Não", "Não tem interesse" e, na 26, as duas "Nunca utilizou…".
- Uma única pergunta condicional na v2: a 26b (abaixo). No resto, o documento
  resolve com alternativas ("Não se aplica", "Não utiliza") e mantemos assim.
- Dois ajustes em relação ao documento, aprovados pelo Ivan em 20/11/2026:
  - **46** — faixas sem sobreposição nem lacuna: "Não", "Sim, até 2 ha",
    "Sim, mais de 2 até 5 ha", "Sim, mais de 5 até 10 ha", "Sim, mais de 10 ha",
    "Não sabe informar".
  - **26** dividida em duas. **26** "Já utilizou crédito rural?"
    (`multiple_choice`): "Nunca utilizou e não tem interesse" e "Nunca
    utilizou, mas gostaria" (ambas exclusivas), "Sim, PRONAF", "Sim, outra
    linha de crédito". **26b** "Para qual finalidade?" (`multiple_choice`,
    mesmo `number` 26): "Custeio", "Investimento ou infraestrutura"; aparece só
    quando a 26 tem alguma alternativa "Sim" (`conditional`, mesmo mecanismo
    da 20b da v1).

### 3. Quadros (perguntas 16, 27 e 38)

Cada linha do quadro é uma pergunta própria, com o mesmo `number`, o mesmo
`group_key` e o mesmo `group_text`:

| Quadro | Linhas | Tipo de cada linha | Alternativas |
|---|---|---|---|
| 16 Produtos e destino | 12 (Mandioca … Outro) | `multiple_choice` | Consumo da família · Venda |
| 27 Acesso a serviços | 6 | `single_choice` | Bom · Regular · Ruim · Não tem |
| 38 Afirmações | 10 (a–j) | `single_choice` | Sim · Em parte · Não |

A linha "Outro" da 16 segue o modelo atual de "especifique": o campo do nome
do produto aparece quando Consumo ou Venda é marcado nessa linha e é gravado em
`textValue` da resposta da linha. Sem marcação não há resposta nem nome
(decisão minha; mantém o modelo de resposta e a coluna `_texto` do export).

Com isso o modelo de resposta não muda (um valor por chave) e cada linha vira
uma coluna no export.

Na tela (celular), o quadro é um cartão só, com o enunciado uma vez e as
linhas empilhadas, cada uma com seus botões lado a lado:

```
PERGUNTA 27
Como avalia o acesso da família aos serviços abaixo?

Serviço de saúde
[ Bom ] [ Regular ] [ Ruim ] [ Não tem ]

Escola para crianças e jovens
[ Bom ] [ Regular ] [ Ruim ] [ Não tem ]
…
```

O progresso e o aviso de "perguntas sem resposta" contam o **quadro como uma
pergunta** (respondido quando todas as linhas têm resposta; na 16, quando ao
menos uma linha foi marcada, pois linha vazia = não produz).

### 4. App de coleta (PWA)

- Entrevista nova grava `questionnaireVersion` = versão mais alta em cache.
  Se o celular atualizou o app mas ainda não conseguiu baixar a v2 (caso raro:
  o app novo só chega com rede), a entrevista sai em v1 e é aceita como v1 —
  a coleta em campo nunca é bloqueada (decisão minha). Ela aparece no painel
  em "Arquivo (v1)".
  A tela da entrevista carrega as perguntas **da versão da entrevista**, não
  "as do cache".
- O cache de perguntas (Dexie) passa a guardar `version`. Ao atualizar,
  substitui as perguntas da versão vigente e mantém as de versões que ainda
  tenham entrevista local não sincronizada. Se faltar no cache a versão de um
  rascunho, busca `GET /api/questions?version=N` quando houver rede.
- Migração do Dexie (nova versão do schema): perguntas em cache sem `version`
  → 1; entrevistas locais sem `questionnaireVersion` → versão inferida das
  chaves das suas respostas (prefixo `v2_` → 2, senão 1); sem respostas →
  versão das perguntas em cache.
- Rascunhos v1 que existam em celulares continuam abrindo com as perguntas v1,
  podem ser concluídos e sincronizam como v1. Nada local é apagado pela troca.
- Subtítulos (`subsection`) aparecem como cabeçalho entre os cartões.
- `exclusive`: marcar a alternativa exclusiva desmarca as outras e vice-versa.
  `max_selections`: ao atingir o limite, as demais ficam desabilitadas, com o
  aviso "até 3".
- Visual: segue os componentes e o estilo atuais de `SurveyPage.tsx`.

### 5. API

- `GET /api/questions` **sem parâmetro fica fixo na v1**, no formato de hoje
  (array). Motivo: o PWA antigo, ainda em cache no celular, faz
  `db.questions.clear()` e regrava o que essa rota devolve; se ela passasse a
  devolver a v2, um rascunho v1 seria exibido e concluído com perguntas v2.
  Fixando em v1, o código antigo nunca enxerga a v2 e continua coerente até o
  service worker atualizar o app (decisão minha).
- O app novo usa `GET /api/questions?version=current` (vigente) ou
  `?version=N`; cada pergunta vem com `version` e os campos novos.
- `POST /api/sync`: `metadata.questionnaireVersion` opcional. O servidor
  **deriva a versão pelas chaves das respostas** (consultando `questions`); o
  campo do payload só vale quando a entrevista não tem respostas; na falta dos
  dois, v1. Isso cobre o PWA antigo, que não envia o campo. Entrevista com
  chaves de versões diferentes é gravada mesmo assim (dado de campo nunca é
  recusado), com a versão da maioria das respostas, e registra um aviso no log.
- `GET /api/surveys` e `/api/surveys/:id` passam a incluir `questionnaireVersion`.
- `GET /api/admin/questions` devolve todas as versões, com `version`.
  Perguntas de versão anterior à vigente são **somente leitura** (PUT/DELETE →
  409) — decisão minha, para o arquivo não ser editado por engano.
- Export (`.csv`, `.xlsx`, `.pdf`): novo parâmetro `version`. Sem ele, usa a
  vigente; com `surveyId`, usa a versão daquela entrevista. Colunas = só as
  perguntas daquela versão; linhas = só entrevistas daquela versão. Nome do
  arquivo ganha `-v1`/`-v2`.
- PDF e detalhe no painel: linhas de quadro aparecem agrupadas sob o enunciado
  do quadro.

### 6. Painel

- Aba Visão geral: seletor "Questionário revisado (v2) | Arquivo (v1)", padrão
  na vigente. Totais, lista de entrevistas e botões de export seguem a versão
  selecionada. Abrir uma entrevista mostra as perguntas da versão dela.
- Aba Perguntas: mesmo seletor; em v1, sem botões de editar/desativar e com o
  rótulo "Arquivo — somente leitura".

### 7. Implantação

1. Dump manual do banco de produção antes do deploy (além do backup diário).
2. PR para `master`; deploy pelo Coolify. No boot: migração (colunas novas,
   tudo existente vira v1) e carga da v2.
3. Conferência em produção: 15 entrevistas em v1, 70 perguntas v1 + 74 v2,
   export v1 igual ao de antes, uma entrevista de teste v2 de ponta a ponta
   (apagada depois).

## Critérios de aceite

- Export v1 (CSV e Excel) depois da mudança = export de antes, célula a célula
  (teste automatizado sobre `buildTable` com as perguntas v1; conferência
  manual contra o banco de produção restaurado localmente).
- Nova entrevista no app mostra os 48 itens na ordem e com os textos do
  documento; quadros 16, 27 e 38, limite da 30 e exclusivas funcionando.
- Entrevista v2 sincroniza, aparece no painel em v2 e exporta com colunas v2.
- Sync de payload sem `questionnaireVersion` e com chaves v1 grava v1.
- Rascunho v1 pré-existente no Dexie abre com perguntas v1 após a atualização.
- `npm run test` e `npm run build` passam.

## Deixado para quem implementa

- Nomes exatos das chaves v2 e dos `value` das alternativas (snake_case, sem
  acento, estáveis).
- Forma de organizar os componentes do quadro e do seletor de versão.
- Como o PDF apresenta os quadros, desde que agrupados e legíveis.
- Estrutura dos testes além dos critérios acima.
