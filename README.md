# RESA Survey

App de questionario offline para o projeto **RESA** (Viabilidade Economica de Assentamentos Rurais nos Tres Biomas de Mato Grosso: Analise Integrada de Sustentabilidade, Carbono e Dinamica Territorial) da UNEMAT.

## Sobre

Ferramenta para coleta de dados em campo e painel administrativo para coordenadores do projeto RESA.

- **68 perguntas** divididas em 3 partes: Socioeconomico, Comportamental e Ambiental
- **100% offline** — funciona sem internet em assentamentos rurais, sincroniza automaticamente ao reconectar
- **PWA** — instala no celular como app nativo
- **Painel admin** — mapa interativo com dashboards, relatorios e exportacao de dados

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| Monorepo | npm workspaces + Turborepo |
| Frontend | React 19 + Vite 6 + TypeScript |
| UI | Tailwind CSS 4 |
| Offline | Dexie.js (IndexedDB) + vite-plugin-pwa |
| Mapa | Leaflet + React-Leaflet |
| Backend | Fastify 5 + TypeScript |
| Banco | PostgreSQL 14 + Drizzle ORM |
| Deploy | Nginx + PM2 (VPS) |

## Estrutura

```
resa-survey/
├── apps/
│   ├── web/          # React + Vite (PWA + Admin)
│   └── server/       # Fastify API
├── packages/
│   └── shared/       # Tipos e schemas compartilhados
├── docs/
│   └── plans/        # Documentos de design e planos
├── turbo.json
└── package.json
```

## Pre-requisitos

- Node.js >= 20
- PostgreSQL 14+

## Setup

```bash
# Clonar
git clone git@github.com:ivanlppires/resa-survey.git
cd resa-survey

# Instalar dependencias
npm install

# Build de todos os pacotes
npm run build

# Dev (todos os pacotes em watch mode)
npm run dev
```

O frontend roda em `http://localhost:5173` e o servidor em `http://localhost:3000`.

## Scripts

| Comando | Descricao |
|---------|-----------|
| `npm run dev` | Inicia todos os pacotes em modo desenvolvimento |
| `npm run build` | Build de producao de todos os pacotes |
| `npm run clean` | Remove dist/ de todos os pacotes |

## Deploy

Deploy via PM2 + Nginx na VPS. Veja `docs/plans/2026-03-07-resa-survey-plan-deploy.md` para detalhes.

```bash
# Na VPS
./deploy.sh
```

## Licenca

Projeto interno UNEMAT. Todos os direitos reservados.
