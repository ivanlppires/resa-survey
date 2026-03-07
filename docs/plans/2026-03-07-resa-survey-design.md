# RESA Survey - Design Document

## Projeto

App de questionario offline para o projeto RESA (Viabilidade Economica de Assentamentos Rurais nos Tres Biomas de Mato Grosso: Analise Integrada de Sustentabilidade, Carbono e Dinamica Territorial) da UNEMAT.

## Contexto

- 68 perguntas divididas em 3 partes (Socioeconomico, Comportamental, Ambiental)
- Usado por poucos entrevistadores (< 10) em celulares nos assentamentos sem internet
- Precisa funcionar 100% offline com sincronizacao automatica ao reconectar
- Painel administrativo web com mapa interativo para coordenadores e parceiros institucionais

## Decisoes Arquiteturais

### Stack

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Monorepo | npm workspaces + Turborepo | Build otimizado, tipos compartilhados |
| Frontend | React 19 + Vite + TypeScript | PWA + Admin numa unica app |
| PWA | vite-plugin-pwa + Workbox | Service Worker, cache offline |
| Banco local | Dexie.js (IndexedDB) | Persistencia offline robusta |
| UI | Tailwind CSS + Framer Motion | Design Apple-like, animacoes fluidas |
| Mapa | Leaflet + React-Leaflet | Gratuito, shapefiles, interativo |
| Graficos | Recharts | Dashboards simples e responsivos |
| Backend | Fastify + TypeScript | Performatico, type-safe |
| ORM | Drizzle ORM | Leve, type-safe, migrations simples |
| Banco servidor | PostgreSQL | Robusto, JSONB para respostas |
| PDF | jsPDF + autoTable | Relatorios no servidor |
| Auth | JWT + bcrypt | Simples, stateless |
| Deploy | VPS ivanpires.dev | Nginx + PM2 |

### Estrutura do Projeto

```
resa-survey/
├── apps/
│   ├── web/                    # React + Vite (PWA + Admin)
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── survey/     # Questionario offline
│   │   │   │   ├── admin/      # Painel admin (mapa, dashboards)
│   │   │   │   └── public/     # Visualizacao publica (parceiros)
│   │   │   ├── lib/
│   │   │   │   ├── db/         # Dexie.js (IndexedDB local)
│   │   │   │   ├── sync/       # Logica de sincronizacao
│   │   │   │   └── map/        # Configuracao do mapa
│   │   │   └── components/     # Componentes compartilhados
│   │   └── public/
│   │       └── sw.js           # Service Worker (via vite-plugin-pwa)
│   └── server/                 # Node.js + Fastify
│       ├── src/
│       │   ├── routes/         # Endpoints da API
│       │   ├── services/       # Logica de negocio
│       │   ├── db/             # Migrations e queries (Drizzle ORM)
│       │   └── reports/        # Geracao de PDF
│       └── drizzle/            # Migrations SQL
├── packages/
│   └── shared/                 # Tipos e schemas compartilhados
│       ├── survey-schema.ts    # Definicao das perguntas
│       ├── sync-types.ts       # Tipos de sincronizacao
│       └── audit-types.ts      # Tipos de auditoria
├── package.json                # Workspaces config
└── turbo.json                  # Turborepo config
```

## App do Questionario (PWA Offline)

### Fluxo do Entrevistador

1. Tela inicial — lista de questionarios salvos (pendentes, em andamento, completos, sincronizados) + botao "Novo Questionario"
2. Identificacao — nome do entrevistador, assentamento, municipio, bioma, n. do lote + GPS automatico
3. Questionario em secoes — navegacao por stepper entre as 3 partes
4. Dentro de cada parte — scroll continuo agrupado por tema (5-8 perguntas por grupo), barra de progresso
5. Salvamento automatico — cada resposta salva no IndexedDB imediatamente
6. Pausar e continuar — pode fechar e retomar a qualquer momento
7. Finalizar — marca como "Concluido", sincroniza automaticamente quando houver internet

### Tipos de Input

| Tipo | Componente |
|------|------------|
| Escolha unica | Radio buttons com cards tocaveis |
| Multipla escolha | Checkboxes com cards |
| Sim/Nao | Botoes grandes lado a lado |
| Escala 1-5 | Botoes numerados |
| Condicional | Campo aparece ao selecionar opcao gatilho |
| Texto livre | Input ao marcar "Outro" |

### UX Apple-like

- Tipografia limpa (Inter), hierarquia clara, bastante espaco em branco
- Cards com bordas suaves, border-radius generoso, sombras sutis
- Animacoes fluidas (Framer Motion) — transicoes slide/fade entre secoes
- Paleta minimalista — fundo claro (#F5F5F7), acentos verdes (sustentabilidade), cinzas neutros
- Feedback visual — efeito de press nos cards, checkmarks animados
- Barra de progresso fina no topo, estilo iOS
- Navegacao por gestos (swipe lateral entre secoes)
- Cards tocaveis grandes (minimo 48px), fonte 16px+
- Status de sincronizacao visivel (icone sutil)

### Dados de Auditoria

- `created_at` — data/hora inicio
- `updated_at` — ultima modificacao
- `completed_at` — data/hora conclusao
- `synced_at` — data/hora sincronizacao
- `interviewer` — nome do entrevistador
- `device_info` — navegador/dispositivo
- `gps_coordinates` — lat/lng
- `response_timestamps` — timestamp de cada resposta individual

## Painel Administrativo (Mapa Interativo)

### Layout

- Mapa fullscreen (100% da tela) com Leaflet
- Barra superior minima flutuante — logo RESA + busca + avatar usuario
- Shapefiles renderizados como poligonos GeoJSON, cores por bioma (Cerrado, Amazonia, Pantanal)
- Clique no assentamento abre drawer lateral direito

### Drawer Lateral

1. Resumo — total de questionarios, completos, pendentes
2. Dashboards — graficos com Recharts (barras, pizza)
3. Relatorios — agregado ou ficha individual, com filtros
4. Exportar PDF — gera PDF do relatorio selecionado
5. Exportar dados — CSV/Excel dos dados brutos

### Visao Publica (parceiros)

- Mesmo mapa e navegacao
- Apenas dados agregados (sem individuais)
- Sem exportacao de dados brutos
- Rota `/public`

## Backend e Sincronizacao

### API (Fastify)

- `POST /api/auth/login` — login
- `POST /api/sync` — recebe lote de questionarios offline
- `GET /api/surveys` — lista questionarios (com filtros)
- `GET /api/surveys/:id` — detalhes
- `GET /api/stats/:settlementId` — estatisticas agregadas
- `GET /api/reports/:type` — relatorio (JSON ou PDF)
- `POST /api/admin/shapefiles` — upload de shapefiles (converte GeoJSON)
- `GET /api/geo/settlements` — GeoJSON dos assentamentos

### Modelo de Dados (PostgreSQL)

```sql
users (id, name, email, password_hash, role)
settlements (id, name, municipality, biome, geojson, metadata)
surveys (id, settlement_id, interviewer_id, lot_number, gps_lat, gps_lng, status, created_at, updated_at, completed_at, synced_at, device_info)
responses (id, survey_id, question_key, value JSONB, answered_at)
sync_log (id, survey_id, device_info, synced_at, payload_hash)
```

### Fluxo de Sincronizacao

1. App salva cada resposta no IndexedDB
2. Detecta internet → POST /api/sync com lote de surveys + responses
3. Servidor valida, insere no PostgreSQL, gera sync_log
4. Retorna synced_ids
5. App marca como synced no IndexedDB

Caracteristicas:
- Idempotente (payload_hash detecta duplicatas)
- Sem conflitos (cada questionario pertence a um unico dispositivo)
- Retry automatico com backoff exponencial
- Fila de sync no IndexedDB

## Schema do Questionario (data-driven)

```typescript
type QuestionType = 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'

interface QuestionOption {
  value: string
  label: string
  hasTextInput?: boolean
}

interface Question {
  key: string
  number: number
  text: string
  type: QuestionType
  options?: QuestionOption[]
  scaleMin?: number
  scaleMax?: number
  conditional?: {
    dependsOn: string
    showWhen: string[]
  }
  section: 'socioeconomic' | 'behavioral' | 'environmental'
}
```

## Seguranca

- JWT com expiracao de 7 dias
- Senhas com bcrypt
- HTTPS com Let's Encrypt
- Rota publica sem auth (dados agregados apenas)
- IndexedDB protegido por same-origin policy
- Sanitizacao de campos de texto livre

## Deploy (VPS ivanpires.dev)

```
Nginx (reverse proxy + HTTPS)
├── resa.ivanpires.dev → build estatico do Vite
├── api.resa.ivanpires.dev → Fastify via PM2
└── PostgreSQL local
```
