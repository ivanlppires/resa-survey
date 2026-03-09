# RESA Survey - Plan 04: PWA Survey Flow

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the survey interviewer flow as a PWA: login screen, survey list, new survey form (identification + 3-part questionnaire), offline storage with Dexie.js, and auto-sync when online.

**Architecture:** React Router for navigation, Dexie.js for IndexedDB offline persistence, context-based auth state, component-per-question-type rendering. The app fetches questions from the API on first load and caches them in IndexedDB. Surveys are saved locally and synced when connectivity returns.

**Tech Stack:** React 19, React Router 7, Dexie.js, Tailwind CSS 4, Framer Motion

---

## Task 1: Install frontend dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Install packages**

```bash
cd /home/ivanpires/Business/resa/resa-survey && npm install react-router dexie framer-motion --workspace=apps/web
```

**Step 2: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "feat(web): add react-router, dexie, and framer-motion"
```

---

## Task 2: Set up Dexie.js offline database

**Files:**
- Create: `apps/web/src/lib/db.ts`

**Step 1: Create apps/web/src/lib/db.ts**

```typescript
import Dexie, { type EntityTable } from 'dexie'

export interface LocalQuestion {
  id: number
  key: string
  number: number
  text: string
  type: 'single_choice' | 'multiple_choice' | 'yes_no' | 'scale' | 'text'
  section: 'socioeconomic' | 'behavioral' | 'environmental'
  options: { value: string; label: string; hasTextInput?: boolean }[] | null
  scaleMin: number | null
  scaleMax: number | null
  conditional: { dependsOn: string; showWhen: string[] } | null
  sortOrder: number
}

export interface LocalSurvey {
  id?: number
  localId: string
  settlementId: number
  settlementName: string
  lotNumber: string
  gpsLat: number | null
  gpsLng: number | null
  status: 'draft' | 'in_progress' | 'completed' | 'synced'
  deviceInfo: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  syncedAt: string | null
}

export interface LocalResponse {
  id?: number
  surveyLocalId: string
  questionKey: string
  value: unknown
  answeredAt: string
}

const db = new Dexie('resa-survey') as Dexie & {
  questions: EntityTable<LocalQuestion, 'id'>
  surveys: EntityTable<LocalSurvey, 'id'>
  responses: EntityTable<LocalResponse, 'id'>
}

db.version(1).stores({
  questions: 'id, key, section, sortOrder',
  surveys: '++id, localId, status, settlementId',
  responses: '++id, surveyLocalId, questionKey, [surveyLocalId+questionKey]',
})

export { db }
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/db.ts
git commit -m "feat(web): add dexie offline database schema"
```

---

## Task 3: Auth context and API client

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/auth.tsx`

**Step 1: Create apps/web/src/lib/api.ts**

```typescript
const API_BASE = '/api'

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('resa_token')
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error ${res.status}`)
  }
  return res.json()
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: { id: number; name: string; email: string; role: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  localStorage.setItem('resa_token', data.token)
  localStorage.setItem('resa_user', JSON.stringify(data.user))
  return data.user
}

export function logout() {
  localStorage.removeItem('resa_token')
  localStorage.removeItem('resa_user')
}

export function getStoredUser() {
  const raw = localStorage.getItem('resa_user')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
```

**Step 2: Create apps/web/src/lib/auth.tsx**

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout, getStoredUser } from './api'

interface User {
  id: number
  name: string
  email: string
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUser(getStoredUser())
    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const u = await apiLogin(email, password)
    setUser(u)
  }

  const logout = () => {
    apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/auth.tsx
git commit -m "feat(web): add API client and auth context"
```

---

## Task 4: Question sync service

**Files:**
- Create: `apps/web/src/lib/sync.ts`

**Step 1: Create apps/web/src/lib/sync.ts**

This service handles:
1. Fetching questions from API and caching in IndexedDB
2. Syncing completed surveys to the server

```typescript
import { db, type LocalQuestion } from './db'
import { apiFetch } from './api'

export async function syncQuestions(): Promise<void> {
  try {
    const questions = await apiFetch<LocalQuestion[]>('/questions')
    await db.questions.clear()
    await db.questions.bulkAdd(questions)
  } catch {
    // Offline — use cached questions
  }
}

export async function getQuestions(): Promise<LocalQuestion[]> {
  let questions = await db.questions.orderBy('sortOrder').toArray()
  if (questions.length === 0) {
    await syncQuestions()
    questions = await db.questions.orderBy('sortOrder').toArray()
  }
  return questions
}

export async function syncCompletedSurveys(): Promise<string[]> {
  const pending = await db.surveys.where('status').equals('completed').toArray()
  if (pending.length === 0) return []

  const token = localStorage.getItem('resa_token')
  if (!token) return []

  const syncedLocalIds: string[] = []

  for (const survey of pending) {
    try {
      const surveyResponses = await db.responses
        .where('surveyLocalId')
        .equals(survey.localId)
        .toArray()

      await apiFetch('/sync', {
        method: 'POST',
        body: JSON.stringify({
          surveys: [{
            metadata: {
              settlementId: survey.settlementId,
              lotNumber: survey.lotNumber,
              gpsLat: survey.gpsLat,
              gpsLng: survey.gpsLng,
              status: survey.status,
              deviceInfo: survey.deviceInfo,
              createdAt: survey.createdAt,
              updatedAt: survey.updatedAt,
              completedAt: survey.completedAt,
            },
            responses: surveyResponses.map((r) => ({
              questionKey: r.questionKey,
              value: r.value,
              answeredAt: r.answeredAt,
            })),
          }],
          deviceInfo: survey.deviceInfo,
          syncedAt: new Date().toISOString(),
        }),
      })

      await db.surveys.where('localId').equals(survey.localId).modify({
        status: 'synced',
        syncedAt: new Date().toISOString(),
      })

      syncedLocalIds.push(survey.localId)
    } catch {
      // Will retry next sync cycle
    }
  }

  return syncedLocalIds
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/sync.ts
git commit -m "feat(web): add question sync and survey upload services"
```

---

## Task 5: Router setup and page shells

**Files:**
- Rewrite: `apps/web/src/App.tsx`
- Rewrite: `apps/web/src/main.tsx`
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/SurveyListPage.tsx`
- Create: `apps/web/src/pages/NewSurveyPage.tsx`
- Create: `apps/web/src/pages/SurveyPage.tsx`
- Create: `apps/web/src/components/ProtectedRoute.tsx`

**Step 1: Create apps/web/src/components/ProtectedRoute.tsx**

```tsx
import { Navigate } from 'react-router'
import { useAuth } from '../lib/auth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

**Step 2: Create apps/web/src/pages/LoginPage.tsx**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../lib/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-gray-900">RESA Survey</h1>
          <p className="mt-2 text-gray-500">Faça login para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: Create apps/web/src/pages/SurveyListPage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../lib/auth'
import { db, type LocalSurvey } from '../lib/db'
import { syncCompletedSurveys, syncQuestions } from '../lib/sync'

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  synced: 'Sincronizado',
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  synced: 'bg-green-100 text-green-700',
}

export default function SurveyListPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [surveys, setSurveys] = useState<LocalSurvey[]>([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadSurveys()
    syncQuestions()
  }, [])

  async function loadSurveys() {
    const all = await db.surveys.reverse().sortBy('createdAt')
    setSurveys(all)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await syncCompletedSurveys()
      await loadSurveys()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-10 border-b border-gray-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">RESA Survey</h1>
            <p className="text-xs text-gray-500">{user?.name}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <Link
          to="/survey/new"
          className="block w-full bg-green-600 text-white text-center rounded-2xl py-4 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm"
        >
          + Novo Questionário
        </Link>

        {surveys.length === 0 ? (
          <p className="text-center text-gray-400 mt-12">Nenhum questionário ainda</p>
        ) : (
          <div className="mt-6 space-y-3">
            {surveys.map((s) => (
              <Link
                key={s.localId}
                to={s.status === 'synced' ? '#' : `/survey/${s.localId}`}
                className="block bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{s.settlementName}</p>
                    <p className="text-sm text-gray-500">Lote {s.lotNumber} · {new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[s.status]}`}>
                    {statusLabels[s.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
```

**Step 4: Create apps/web/src/pages/NewSurveyPage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { db } from '../lib/db'
import { apiFetch } from '../lib/api'

interface Settlement {
  id: number
  name: string
  municipality: string
  biome: string
}

export default function NewSurveyPage() {
  const navigate = useNavigate()
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [settlementId, setSettlementId] = useState<number | ''>('')
  const [lotNumber, setLotNumber] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch<Settlement[]>('/settlements').then(setSettlements).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settlementId) return
    setLoading(true)

    const settlement = settlements.find((s) => s.id === settlementId)
    const localId = crypto.randomUUID()
    const now = new Date().toISOString()

    let gpsLat: number | null = null
    let gpsLng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      gpsLat = pos.coords.latitude
      gpsLng = pos.coords.longitude
    } catch {
      // GPS not available
    }

    await db.surveys.add({
      localId,
      settlementId: settlementId as number,
      settlementName: settlement?.name ?? 'Desconhecido',
      lotNumber,
      gpsLat,
      gpsLng,
      status: 'in_progress',
      deviceInfo: navigator.userAgent,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      syncedAt: null,
    })

    navigate(`/survey/${localId}`)
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-10 border-b border-gray-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-900">
            ← Voltar
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Novo Questionário</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assentamento</label>
            {settlements.length > 0 ? (
              <select
                value={settlementId}
                onChange={(e) => setSettlementId(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              >
                <option value="">Selecione...</option>
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.municipality}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400 py-3">Nenhum assentamento cadastrado. Peça ao admin para cadastrar.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número do Lote</label>
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: 42"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !settlementId}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Iniciar Questionário'}
          </button>
        </form>
      </main>
    </div>
  )
}
```

**Step 5: Create apps/web/src/pages/SurveyPage.tsx**

This is the main survey page with the 3-section stepper and question rendering.

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { db, type LocalQuestion, type LocalResponse } from '../lib/db'
import { getQuestions } from '../lib/sync'

const sectionLabels = {
  socioeconomic: 'Socioeconômico',
  behavioral: 'Comportamental',
  environmental: 'Ambiental',
} as const

type Section = keyof typeof sectionLabels

export default function SurveyPage() {
  const { localId } = useParams<{ localId: string }>()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<LocalQuestion[]>([])
  const [responses, setResponses] = useState<Map<string, unknown>>(new Map())
  const [currentSection, setCurrentSection] = useState<Section>('socioeconomic')
  const [loading, setLoading] = useState(true)

  const sections: Section[] = ['socioeconomic', 'behavioral', 'environmental']

  useEffect(() => {
    async function load() {
      const qs = await getQuestions()
      setQuestions(qs)
      const existing = await db.responses.where('surveyLocalId').equals(localId!).toArray()
      const map = new Map<string, unknown>()
      existing.forEach((r) => map.set(r.questionKey, r.value))
      setResponses(map)
      setLoading(false)
    }
    load()
  }, [localId])

  const saveResponse = useCallback(async (questionKey: string, value: unknown) => {
    setResponses((prev) => new Map(prev).set(questionKey, value))

    const existing = await db.responses
      .where('[surveyLocalId+questionKey]')
      .equals([localId!, questionKey])
      .first()

    const now = new Date().toISOString()
    if (existing) {
      await db.responses.update(existing.id!, { value, answeredAt: now })
    } else {
      await db.responses.add({ surveyLocalId: localId!, questionKey, value, answeredAt: now })
    }

    await db.surveys.where('localId').equals(localId!).modify({ updatedAt: now })
  }, [localId])

  const handleComplete = async () => {
    const now = new Date().toISOString()
    await db.surveys.where('localId').equals(localId!).modify({
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    })
    navigate('/')
  }

  const sectionQuestions = questions.filter((q) => {
    if (q.section !== currentSection) return false
    if (q.conditional) {
      const parentValue = responses.get(q.conditional.dependsOn)
      if (!parentValue || !q.conditional.showWhen.includes(parentValue as string)) return false
    }
    return true
  })

  const totalQuestions = questions.filter((q) => !q.conditional).length
  const answeredCount = responses.size
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0

  if (loading) return <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center"><p className="text-gray-400">Carregando...</p></div>

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 z-50">
        <motion.div
          className="h-full bg-green-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <header className="bg-white/80 backdrop-blur-lg sticky top-1 z-10 border-b border-gray-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-900">← Voltar</button>
          <span className="text-sm text-gray-500">{Math.round(progress)}% concluído</span>
        </div>
        {/* Section tabs */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-1">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setCurrentSection(s)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
                currentSection === s
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sectionLabels[s]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {sectionQuestions.map((q) => (
              <QuestionCard
                key={q.key}
                question={q}
                value={responses.get(q.key)}
                onChange={(val) => saveResponse(q.key, val)}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {currentSection === 'environmental' && (
          <div className="mt-8">
            <button
              onClick={handleComplete}
              className="w-full bg-green-600 text-white rounded-2xl py-4 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all"
            >
              Finalizar Questionário
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function QuestionCard({ question, value, onChange }: {
  question: LocalQuestion
  value: unknown
  onChange: (val: unknown) => void
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="text-sm text-gray-400 mb-1">Pergunta {question.number}</p>
      <p className="font-medium text-gray-900 mb-4">{question.text}</p>

      {question.type === 'single_choice' && question.options && (
        <SingleChoice options={question.options} value={value as string} onChange={onChange} />
      )}
      {question.type === 'multiple_choice' && question.options && (
        <MultipleChoice options={question.options} value={(value as string[]) ?? []} onChange={onChange} />
      )}
      {question.type === 'yes_no' && question.options && (
        <SingleChoice options={question.options} value={value as string} onChange={onChange} />
      )}
      {question.type === 'scale' && (
        <ScaleInput min={question.scaleMin ?? 1} max={question.scaleMax ?? 5} value={value as number} onChange={onChange} />
      )}
      {question.type === 'text' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[80px]"
          placeholder="Digite sua resposta..."
        />
      )}
    </div>
  )
}

function SingleChoice({ options, value, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string
  onChange: (val: string) => void
}) {
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <div key={opt.value}>
          <button
            onClick={() => onChange(opt.value)}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
              value === opt.value
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
          {opt.hasTextInput && value === opt.value && (
            <input
              type="text"
              value={textInputs[opt.value] ?? ''}
              onChange={(e) => {
                setTextInputs((prev) => ({ ...prev, [opt.value]: e.target.value }))
                onChange(`${opt.value}:${e.target.value}`)
              }}
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Especifique..."
            />
          )}
        </div>
      ))}
    </div>
  )
}

function MultipleChoice({ options, value, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string[]
  onChange: (val: string[]) => void
}) {
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

  const toggle = (optValue: string) => {
    const next = value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value)
        return (
          <div key={opt.value}>
            <button
              onClick={() => toggle(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
                selected
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-xs border ${
                  selected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                }`}>
                  {selected && '✓'}
                </span>
                {opt.label}
              </span>
            </button>
            {opt.hasTextInput && selected && (
              <input
                type="text"
                value={textInputs[opt.value] ?? ''}
                onChange={(e) => setTextInputs((prev) => ({ ...prev, [opt.value]: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Especifique..."
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScaleInput({ min, max, value, onChange }: {
  min: number
  max: number
  value: number
  onChange: (val: number) => void
}) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <div className="flex gap-2 justify-center">
      {points.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-12 h-12 rounded-xl border text-base font-medium transition-all active:scale-[0.95] ${
            value === n
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
```

**Step 6: Rewrite apps/web/src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import SurveyListPage from './pages/SurveyListPage'
import NewSurveyPage from './pages/NewSurveyPage'
import SurveyPage from './pages/SurveyPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><SurveyListPage /></ProtectedRoute>} />
          <Route path="/survey/new" element={<ProtectedRoute><NewSurveyPage /></ProtectedRoute>} />
          <Route path="/survey/:localId" element={<ProtectedRoute><SurveyPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

**Step 7: Rewrite apps/web/src/main.tsx**

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

**Step 8: Build and verify**

```bash
cd /home/ivanpires/Business/resa/resa-survey && npx turbo build
```

**Step 9: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add login, survey list, new survey, and survey questionnaire pages"
```

---

## Task 6: Deploy to VPS

**Step 1: Push and deploy**

```bash
git push origin master
ssh webmaster@ivanpires.dev "cd /home/webmaster/apps/resa/resa-survey && git checkout -- package-lock.json && git pull origin master && npm install && npx turbo build && pm2 restart resa-server"
```

**Step 2: Verify**

```bash
curl -s https://resa.ivanpires.dev/ | head -20
```

**Step 3: Commit plan doc**

```bash
git add docs/plans/2026-03-09-resa-survey-plan-04-pwa-survey-flow.md
git commit -m "docs: add Plan 04 - PWA survey flow"
git push origin master
```

---

## Summary

After completing this plan:

```
apps/web/src/
├── components/
│   └── ProtectedRoute.tsx     # Auth guard
├── lib/
│   ├── api.ts                 # Fetch wrapper with JWT
│   ├── auth.tsx               # Auth context + provider
│   ├── db.ts                  # Dexie.js IndexedDB schema
│   └── sync.ts                # Question cache + survey sync
├── pages/
│   ├── LoginPage.tsx          # Login form
│   ├── SurveyListPage.tsx     # Survey list with sync
│   ├── NewSurveyPage.tsx      # New survey identification form
│   └── SurveyPage.tsx         # 3-section questionnaire with auto-save
├── App.tsx                    # Router + auth provider
├── main.tsx                   # Entry point
└── index.css                  # Tailwind import
```

Features:
- Login with JWT persistence
- Offline-first survey list (saved in IndexedDB)
- New survey: select settlement, enter lot number, auto GPS
- 3-section questionnaire with section tabs and progress bar
- Auto-save each answer to IndexedDB immediately
- Question types: single choice, multiple choice, yes/no, scale, text
- Conditional questions (show/hide based on parent answer)
- Framer Motion animations between sections
- Sync completed surveys to server
- Apple-like UI: rounded cards, green accents, clean typography

**Next plan:** Plan 05 — Admin panel (map with Leaflet, dashboards with Recharts, question/settlement management UI)
