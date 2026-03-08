# RESA Survey - Plan 01: Project Structure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the monorepo with npm workspaces + Turborepo, configure TypeScript, and set up the three packages (web, server, shared) with build/dev scripts working end-to-end.

**Architecture:** npm workspaces monorepo with Turborepo for orchestration. Three packages: `apps/web` (React + Vite), `apps/server` (Fastify), `packages/shared` (types/schemas). Shared package is consumed by both apps via workspace dependency.

**Tech Stack:** Node.js 20+, TypeScript 5, npm workspaces, Turborepo, Vite, React 19, Fastify, Tailwind CSS 4

---

## Task 1: Root monorepo setup

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.nvmrc`

**Step 1: Create root package.json**

```json
{
  "name": "resa-survey",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
.turbo/
*.log
.env
.env.*
!.env.example
.DS_Store
```

**Step 4: Create .nvmrc**

```
20
```

**Step 5: Install root dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated, turbo installed.

**Step 6: Verify turbo is available**

Run: `npx turbo --version`
Expected: Prints turbo version (2.x.x)

**Step 7: Commit**

```bash
git add package.json turbo.json .gitignore .nvmrc package-lock.json
git commit -m "chore: scaffold root monorepo with npm workspaces and turborepo"
```

---

## Task 2: Shared package (types and schemas)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/survey-schema.ts`
- Create: `packages/shared/src/sync-types.ts`

**Step 1: Create packages/shared/package.json**

```json
{
  "name": "@resa/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

**Step 2: Create packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

**Step 3: Create packages/shared/src/survey-schema.ts**

This is the data-driven question schema from the design doc. Start with types only — question data comes in a later plan.

```typescript
export type QuestionType = 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'

export type SurveySection = 'socioeconomic' | 'behavioral' | 'environmental'

export interface QuestionOption {
  value: string
  label: string
  hasTextInput?: boolean
}

export interface ConditionalRule {
  dependsOn: string
  showWhen: string[]
}

export interface Question {
  key: string
  number: number
  text: string
  type: QuestionType
  options?: QuestionOption[]
  scaleMin?: number
  scaleMax?: number
  conditional?: ConditionalRule
  section: SurveySection
}

export type SurveyStatus = 'draft' | 'in_progress' | 'completed' | 'synced'

export interface SurveyMetadata {
  id: string
  settlementId: string
  interviewerId: string
  lotNumber: string
  gpsLat: number | null
  gpsLng: number | null
  status: SurveyStatus
  createdAt: string
  updatedAt: string
  completedAt: string | null
  syncedAt: string | null
  deviceInfo: string
}

export interface SurveyResponse {
  questionKey: string
  value: string | string[] | number
  textValue?: string
  answeredAt: string
}
```

**Step 4: Create packages/shared/src/sync-types.ts**

```typescript
import type { SurveyMetadata, SurveyResponse } from './survey-schema.js'

export interface SyncPayload {
  surveys: SyncSurvey[]
  deviceInfo: string
  syncedAt: string
}

export interface SyncSurvey {
  metadata: SurveyMetadata
  responses: SurveyResponse[]
}

export interface SyncResult {
  syncedIds: string[]
  errors: SyncError[]
}

export interface SyncError {
  surveyId: string
  message: string
}
```

**Step 5: Create packages/shared/src/index.ts**

```typescript
export * from './survey-schema.js'
export * from './sync-types.js'
```

**Step 6: Install dependencies and build**

Run: `npm install && npx turbo build --filter=@resa/shared`
Expected: `packages/shared/dist/` created with `.js` and `.d.ts` files.

**Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package with survey schema and sync types"
```

---

## Task 3: Web app scaffold (React + Vite)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/vite-env.d.ts`

**Step 1: Create apps/web/package.json**

```json
{
  "name": "@resa/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@resa/shared": "*"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "vite": "^6",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4"
  }
}
```

**Step 2: Create apps/web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 3: Create apps/web/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 4: Create apps/web/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 5: Create apps/web/index.html**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RESA Survey</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create apps/web/src/index.css**

```css
@import "tailwindcss";
```

**Step 7: Create apps/web/src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

**Step 8: Create apps/web/src/App.tsx**

```tsx
import type { SurveyStatus } from '@resa/shared'

const status: SurveyStatus = 'draft'

export default function App() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-gray-900">RESA Survey</h1>
        <p className="mt-2 text-gray-500">Status: {status}</p>
      </div>
    </div>
  )
}
```

**Step 9: Create apps/web/src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 10: Install and verify build**

Run: `npm install && npx turbo build`
Expected: Both `@resa/shared` and `@resa/web` build successfully. `apps/web/dist/` contains `index.html` and bundled assets.

**Step 11: Verify dev server starts**

Run: `npx turbo dev --filter=@resa/web` (stop after confirming it starts)
Expected: Vite dev server at http://localhost:5173, page shows "RESA Survey" with "Status: draft".

**Step 12: Commit**

```bash
git add apps/web/
git commit -m "feat: scaffold web app with react, vite, and tailwind"
```

---

## Task 4: Server app scaffold (Fastify)

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/routes/health.ts`

**Step 1: Create apps/server/package.json**

```json
{
  "name": "@resa/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "fastify": "^5",
    "@resa/shared": "*"
  },
  "devDependencies": {
    "typescript": "^5",
    "tsx": "^4"
  }
}
```

**Step 2: Create apps/server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

**Step 3: Create apps/server/src/routes/health.ts**

```typescript
import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    return { status: 'ok' }
  })
}
```

**Step 4: Create apps/server/src/index.ts**

```typescript
import Fastify from 'fastify'
import { healthRoutes } from './routes/health.js'

const app = Fastify({ logger: true })

await app.register(healthRoutes)

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
```

**Step 5: Install and verify build**

Run: `npm install && npx turbo build`
Expected: All three packages build successfully.

**Step 6: Verify server starts**

Run: `cd apps/server && npx tsx src/index.ts &` then `curl http://localhost:3000/api/health` then kill the background process.
Expected: `{"status":"ok"}`

**Step 7: Commit**

```bash
git add apps/server/
git commit -m "feat: scaffold server app with fastify and health endpoint"
```

---

## Task 5: Verify full monorepo integration

**Step 1: Clean and rebuild everything**

Run: `npx turbo clean && npm install && npx turbo build`
Expected: All 3 packages build successfully in dependency order: `@resa/shared` -> `@resa/web` + `@resa/server`.

**Step 2: Verify workspace dependency resolution**

Run: `npm ls @resa/shared`
Expected: Shows `@resa/shared` is resolved from workspace for both `@resa/web` and `@resa/server`.

**Step 3: Verify turbo pipeline**

Run: `npx turbo build --dry`
Expected: Shows build order — shared first, then web and server in parallel.

**Step 4: Commit any lockfile changes**

```bash
git add package-lock.json
git commit -m "chore: update lockfile after full monorepo verification"
```

---

## Summary

After completing this plan, the project structure will be:

```
resa-survey/
├── apps/
│   ├── web/          # React + Vite + Tailwind (builds, dev server works)
│   └── server/       # Fastify (builds, health endpoint works)
├── packages/
│   └── shared/       # TypeScript types (survey schema, sync types)
├── package.json      # npm workspaces root
├── turbo.json        # Turborepo config
├── .gitignore
└── .nvmrc
```

Both apps successfully import from `@resa/shared`, `turbo build` and `turbo dev` work end-to-end.

**Next plan:** Plan 02 will cover the survey question data (encoding all 68 questions from `questionario.txt` into the schema).
