import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { apiFetch } from '../lib/api'

interface Settlement {
  id: number
  name: string
  municipality: string
  biome: string
}

interface UserInfo {
  id: number
  name: string
  email: string
  role: string
  createdAt: string
}

interface SurveyOverview {
  id: number
  settlementId: number
  interviewerId: number
  lotNumber: string | null
  status: string
  createdAt: string
  completedAt: string | null
}

interface Question {
  id: number
  key: string
  number: number
  text: string
  type: string
  section: string
  options: { value: string; label: string; hasTextInput?: boolean }[] | null
  scaleMin: number | null
  scaleMax: number | null
  sortOrder: number
  active: boolean
}

type Tab = 'overview' | 'questions' | 'settlements' | 'users'

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  interviewer: 'Entrevistador',
  viewer: 'Visualizador',
}

const roleStyles: Record<string, string> = {
  admin: 'bg-apple-purple/12 text-apple-purple',
  interviewer: 'bg-apple-blue/12 text-apple-blue',
  viewer: 'bg-apple-secondary/10 text-apple-secondary',
}

const BIOMES = ['Amazônia', 'Cerrado', 'Pantanal']

const tabConfig: { key: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    key: 'overview',
    label: 'Geral',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    key: 'questions',
    label: 'Perguntas',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    key: 'settlements',
    label: 'Locais',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    key: 'users',
    label: 'Usuários',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
]

export default function AdminDashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="min-h-dvh bg-apple-bg flex flex-col">
      {/* Header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-0 z-10 border-b border-apple-glass-border safe-top">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-apple-text tracking-tight">RESA Admin</h1>
            <p className="text-[13px] text-apple-secondary">{user?.name}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { logout(); navigate('/login') }}
            className="text-[14px] font-semibold h-9 px-4 rounded-full bg-apple-text/5 text-apple-secondary hover:bg-apple-text/8 transition-colors"
          >
            Sair
          </motion.button>
        </div>
      </header>

      {/* Content with bottom padding for tab bar */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-5 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'overview' && <OverviewTab />}
            {tab === 'questions' && <QuestionsTab />}
            {tab === 'settlements' && <SettlementsTab />}
            {tab === 'users' && <UsersTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-apple-glass backdrop-blur-2xl border-t border-apple-glass-border z-20">
        <div className="max-w-2xl mx-auto flex safe-bottom">
          {tabConfig.map((t) => {
            const isActive = tab === t.key
            return (
              <motion.button
                key={t.key}
                whileTap={{ scale: 0.92 }}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex flex-col items-center pt-2 pb-1.5 gap-0.5 transition-colors ${
                  isActive ? 'text-apple-green' : 'text-apple-secondary'
                }`}
              >
                {t.icon(isActive)}
                <span className="text-[10px] font-semibold">{t.label}</span>
              </motion.button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function DestructiveSheet({ open, title, message, onConfirm, onCancel }: {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          onClick={onCancel}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="absolute bottom-0 left-0 right-0 sm:relative sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-apple-card w-full sm:max-w-[380px] rounded-t-2xl sm:rounded-2xl shadow-[0_-4px_40px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full bg-apple-text/10 mx-auto mt-2.5 mb-1 sm:hidden" />

            <div className="px-5 pt-4 pb-3 text-center">
              <div className="w-11 h-11 rounded-full bg-apple-red/10 flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </div>
              <p className="text-[16px] font-bold text-apple-text">{title}</p>
              <p className="text-[14px] text-apple-secondary mt-1 leading-snug">{message}</p>
            </div>

            <div className="h-px bg-apple-separator" />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onConfirm}
              className="w-full py-3.5 text-[17px] font-semibold text-apple-red active:bg-apple-red/5 transition-colors"
            >
              Excluir
            </motion.button>

            <div className="h-px bg-apple-separator" />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onCancel}
              className="w-full py-3.5 text-[17px] font-semibold text-apple-blue active:bg-apple-text/3 transition-colors"
              style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom, 0px))' }}
            >
              Cancelar
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function OverviewTab() {
  const [surveys, setSurveys] = useState<SurveyOverview[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<SurveyOverview[]>('/surveys'),
      apiFetch<Settlement[]>('/settlements'),
      apiFetch<UserInfo[]>('/admin/users'),
    ]).then(([s, st, u]) => {
      setSurveys(s)
      setSettlements(st)
      setUsers(u)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-center text-[15px] text-apple-secondary py-12">Carregando...</p>

  const synced = surveys.filter(s => s.status === 'synced').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Questionários', value: surveys.length, color: 'text-apple-blue' },
          { label: 'Sincronizados', value: synced, color: 'text-apple-green' },
          { label: 'Assentamentos', value: settlements.length, color: 'text-apple-orange' },
          { label: 'Usuários', value: users.length, color: 'text-apple-purple' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] text-center"
          >
            <p className={`text-[28px] font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[12px] font-medium text-apple-secondary mt-0.5">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {surveys.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#808086" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
          </div>
          <p className="text-[16px] font-medium text-apple-secondary">Nenhum questionário sincronizado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <h2 className="text-[13px] font-semibold text-apple-secondary uppercase tracking-wide px-1">Últimos questionários</h2>
          {surveys.slice(0, 10).map((s, i) => {
            const settlement = settlements.find(st => st.id === s.settlementId)
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-apple-text truncate">{settlement?.name ?? `#${s.settlementId}`}</p>
                    <p className="text-[13px] text-apple-secondary mt-0.5">
                      {s.lotNumber ? `Lote ${s.lotNumber} · ` : ''}
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`text-[12px] font-semibold px-2.5 py-[3px] rounded-full ${
                    s.status === 'synced' ? 'bg-apple-green/12 text-apple-green' : 'bg-apple-blue/12 text-apple-blue'
                  }`}>
                    {s.status === 'synced' ? 'Sincronizado' : s.status}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const sectionLabels: Record<string, string> = {
  socioeconomic: 'Socioeconômico',
  behavioral: 'Comportamental',
  environmental: 'Ambiental',
}

const typeConfig: Record<string, { label: string; short: string; icon: React.ReactNode; color: string }> = {
  single_choice: {
    label: 'Escolha única',
    short: 'Única',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
      </svg>
    ),
    color: 'text-apple-blue bg-apple-blue/10',
  },
  multiple_choice: {
    label: 'Múltipla escolha',
    short: 'Múltipla',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
    ),
    color: 'text-apple-purple bg-apple-purple/10',
  },
  yes_no: {
    label: 'Sim/Não',
    short: 'S/N',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 12h8" />
        <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" />
        <path d="M12 8v8" />
      </svg>
    ),
    color: 'text-apple-orange bg-apple-orange/10',
  },
  scale: {
    label: 'Escala',
    short: 'Escala',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 18h4v-4H3zM10 18h4v-8h-4zM17 18h4V6h-4z" />
      </svg>
    ),
    color: 'text-apple-green bg-apple-green/10',
  },
  text: {
    label: 'Texto',
    short: 'Texto',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 7V4h16v3" />
        <path d="M12 4v16" />
        <path d="M8 20h8" />
      </svg>
    ),
    color: 'text-apple-secondary bg-apple-text/5',
  },
}

function QuestionsTab() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [filterSection, setFilterSection] = useState<string>('all')

  const loadQuestions = () => {
    apiFetch<Question[]>('/admin/questions').then(setQuestions).finally(() => setLoading(false))
  }

  useEffect(() => { loadQuestions() }, [])

  const startEdit = (q: Question) => {
    setEditingId(q.id)
    setEditText(q.text)
  }

  const handleSave = async (id: number) => {
    setSaving(true)
    try {
      await apiFetch(`/admin/questions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ text: editText }),
      })
      setEditingId(null)
      loadQuestions()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await apiFetch(`/admin/questions/${id}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    loadQuestions()
  }

  const handleRestore = async (id: number) => {
    await apiFetch(`/admin/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: true }),
    })
    loadQuestions()
  }

  if (loading) return <p className="text-center text-[15px] text-apple-secondary py-12">Carregando...</p>

  const filterChips: { key: string; label: string; icon: React.ReactNode }[] = [
    {
      key: 'all',
      label: 'Todas',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      key: 'socioeconomic',
      label: 'Social',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: 'behavioral',
      label: 'Comporta.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7.5L12 20l-3-3.5C7 14.5 5 12 5 9a7 7 0 0 1 7-7z" />
          <circle cx="12" cy="9" r="2" />
        </svg>
      ),
    },
    {
      key: 'environmental',
      label: 'Ambiental',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 8c.7-1 1-2.2 1-3.5C18 2.5 16.5 1 14.5 1c-1.2 0-2.3.5-3 1.3A4.5 4.5 0 0 0 5 4.5C5 6.3 5.7 7.5 7 9" />
          <path d="M12 22V10" />
          <path d="M7 15h10" />
          <path d="M9 12h6" />
          <path d="M8 18h8" />
        </svg>
      ),
    },
  ]

  const filtered = filterSection === 'all' ? questions : questions.filter(q => q.section === filterSection)
  const activeCount = questions.filter(q => q.active).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-[13px] text-apple-secondary">
          <span className="font-semibold text-apple-text">{activeCount}</span> ativas de <span className="font-semibold text-apple-text">{questions.length}</span>
        </p>
      </div>

      {/* Filter chips */}
      <div className="grid grid-cols-4 gap-1.5">
        {filterChips.map((chip) => {
          const active = filterSection === chip.key
          return (
            <motion.button
              key={chip.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterSection(chip.key)}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all ${
                active
                  ? 'bg-apple-green text-white shadow-[0_2px_8px_rgba(34,163,82,0.25)]'
                  : 'bg-apple-card text-apple-secondary shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)]'
              }`}
            >
              {chip.icon}
              {chip.label}
            </motion.button>
          )
        })}
      </div>

      <div className="space-y-2">
        {filtered.map((q, i) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className={`bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] ${
              !q.active ? 'opacity-50' : ''
            }`}
          >
            {editingId === q.id ? (
              <div className="space-y-3">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-apple-bg rounded-xl px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 min-h-[80px] transition-shadow"
                  autoFocus
                />
                <div className="flex gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSave(q.id)}
                    disabled={saving || !editText.trim()}
                    className="text-[14px] font-semibold h-9 px-5 rounded-full bg-apple-green text-white disabled:opacity-40"
                  >
                    {saving ? 'Salvando...' : 'Salvar'}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setEditingId(null)}
                    className="text-[14px] font-semibold h-9 px-5 rounded-full bg-apple-text/5 text-apple-text"
                  >
                    Cancelar
                  </motion.button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[12px] font-bold text-apple-green shrink-0">Q{q.number}</span>
                      {(() => {
                        const tc = typeConfig[q.type]
                        return tc ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-[2px] rounded-full ${tc.color}`}>
                            {tc.icon}
                            <span>{tc.short}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-[2px] rounded-full bg-apple-text/5 text-apple-secondary">
                            {q.type}
                          </span>
                        )
                      })()}
                      {filterSection === 'all' && (
                        <span className="text-[11px] font-semibold px-1.5 py-[2px] rounded-full bg-apple-blue/8 text-apple-blue truncate">
                          {sectionLabels[q.section]}
                        </span>
                      )}
                    </div>
                    <p className="text-[14px] text-apple-text leading-snug">{q.text}</p>
                    {q.options && q.options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {q.options.map((opt) => (
                          <span key={opt.value} className="text-[11px] px-2 py-[2px] rounded-full bg-apple-bg text-apple-secondary">
                            {opt.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Action buttons - mobile-friendly row */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-apple-separator">
                  {q.active ? (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => startEdit(q)}
                        className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
                      >
                        Editar
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setConfirmDeleteId(q.id)}
                        className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-red/8 text-apple-red hover:bg-apple-red/14 transition-colors"
                      >
                        Excluir
                      </motion.button>
                    </>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRestore(q.id)}
                      className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-green/10 text-apple-green"
                    >
                      Reativar
                    </motion.button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>

      <DestructiveSheet
        open={confirmDeleteId !== null}
        title="Desativar pergunta?"
        message={`A pergunta Q${questions.find(q => q.id === confirmDeleteId)?.number ?? ''} será desativada.`}
        onConfirm={() => { if (confirmDeleteId !== null) handleDelete(confirmDeleteId) }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

function SettlementsTab() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [selectedBiomes, setSelectedBiomes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const loadSettlements = () => {
    apiFetch<Settlement[]>('/settlements').then(setSettlements).finally(() => setLoading(false))
  }

  useEffect(() => { loadSettlements() }, [])

  const toggleBiome = (b: string) => {
    setSelectedBiomes((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b])
  }

  const startEdit = (s: Settlement) => {
    setEditingId(s.id)
    setName(s.name)
    setMunicipality(s.municipality)
    setSelectedBiomes(s.biome.split(', ').filter(Boolean))
  }

  const startNew = () => {
    setEditingId('new')
    setName('')
    setMunicipality('')
    setSelectedBiomes([])
  }

  const cancel = () => {
    setEditingId(null)
    setName('')
    setMunicipality('')
    setSelectedBiomes([])
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedBiomes.length === 0) return
    setSaving(true)
    try {
      if (editingId === 'new') {
        await apiFetch('/admin/settlements', {
          method: 'POST',
          body: JSON.stringify({ name, municipality, biome: selectedBiomes.join(', ') }),
        })
      } else {
        await apiFetch(`/admin/settlements/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ name, municipality, biome: selectedBiomes.join(', ') }),
        })
      }
      cancel()
      loadSettlements()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await apiFetch(`/admin/settlements/${id}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    loadSettlements()
  }

  if (loading) return <p className="text-center text-[15px] text-apple-secondary py-12">Carregando...</p>

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {editingId === null ? (
          <motion.div key="add-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={startNew}
              className="flex items-center justify-center gap-2 w-full bg-apple-green text-white rounded-2xl py-4 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(34,163,82,0.25)]"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Novo Assentamento
            </motion.button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleSave}
            className="space-y-4"
          >
            <h2 className="text-[13px] font-semibold text-apple-secondary uppercase tracking-wide px-1">
              {editingId === 'new' ? 'Novo Assentamento' : 'Editar Assentamento'}
            </h2>

            <div className="bg-apple-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
              <div className="px-4 pt-3.5 pb-3">
                <label className="block text-[13px] font-medium text-apple-secondary mb-1">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                  placeholder="Ex: PA Nova Esperança"
                  required
                />
              </div>
              <div className="h-px bg-apple-separator mx-4" />
              <div className="px-4 pt-3.5 pb-3">
                <label className="block text-[13px] font-medium text-apple-secondary mb-1">Município</label>
                <input
                  type="text"
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                  placeholder="Ex: Cáceres"
                  required
                />
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold text-apple-secondary uppercase tracking-wide px-1 mb-2">Bioma(s)</h3>
              <div className="flex gap-2">
                {BIOMES.map((b) => {
                  const selected = selectedBiomes.includes(b)
                  return (
                    <motion.button
                      key={b}
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleBiome(b)}
                      className={`flex-1 py-3 rounded-xl text-[14px] font-semibold transition-all ${
                        selected
                          ? 'bg-apple-green text-white shadow-[0_2px_8px_rgba(34,163,82,0.25)]'
                          : 'bg-apple-card text-apple-text shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]'
                      }`}
                    >
                      {b}
                    </motion.button>
                  )
                })}
              </div>
              {selectedBiomes.length === 0 && (
                <p className="text-[12px] text-apple-red mt-1.5 px-1">Selecione pelo menos um bioma</p>
              )}
            </div>

            <div className="flex gap-3">
              <motion.button
                type="submit"
                disabled={saving}
                whileTap={{ scale: 0.97 }}
                className="flex-1 bg-apple-green text-white rounded-2xl py-3.5 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={cancel}
                className="px-6 rounded-2xl py-3.5 text-[17px] font-semibold bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
              >
                Cancelar
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {settlements.length === 0 && editingId === null ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#808086" strokeWidth="1.5">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </div>
          <p className="text-[16px] font-medium text-apple-secondary">Nenhum assentamento cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {settlements.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-apple-text">{s.name}</p>
                <p className="text-[13px] text-apple-secondary mt-0.5">{s.municipality} · {s.biome}</p>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-apple-separator">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => startEdit(s)}
                  className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
                >
                  Editar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfirmDeleteId(s.id)}
                  className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-red/8 text-apple-red hover:bg-apple-red/14 transition-colors"
                >
                  Excluir
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <DestructiveSheet
        open={confirmDeleteId !== null}
        title="Excluir assentamento?"
        message={`"${settlements.find(s => s.id === confirmDeleteId)?.name ?? ''}" será removido permanentemente.`}
        onConfirm={() => { if (confirmDeleteId !== null) handleDelete(confirmDeleteId) }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

function UsersTab() {
  const { user: currentUser } = useAuth()
  const [userList, setUserList] = useState<UserInfo[]>([])
  const [allSettlements, setAllSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'interviewer' | 'viewer'>('interviewer')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const [assignUserId, setAssignUserId] = useState<number | null>(null)
  const [assignedIds, setAssignedIds] = useState<number[]>([])
  const [savingAssign, setSavingAssign] = useState(false)

  const loadUsers = () => {
    apiFetch<UserInfo[]>('/admin/users').then(setUserList).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()
    apiFetch<Settlement[]>('/settlements').then(setAllSettlements).catch(() => {})
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      })
      setMessage(`Usuário ${email} criado com sucesso!`)
      setName('')
      setEmail('')
      setPassword('')
      setShowForm(false)
      loadUsers()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/admin/users/${id}`, { method: 'DELETE' })
      setConfirmDeleteId(null)
      loadUsers()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao excluir usuário')
    }
  }

  const openAssign = async (userId: number) => {
    setAssignUserId(userId)
    try {
      const ids = await apiFetch<number[]>(`/admin/users/${userId}/settlements`)
      setAssignedIds(ids)
    } catch {
      setAssignedIds([])
    }
  }

  const toggleSettlement = (sid: number) => {
    setAssignedIds((prev) => prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid])
  }

  const saveAssignments = async () => {
    if (!assignUserId) return
    setSavingAssign(true)
    try {
      await apiFetch(`/admin/users/${assignUserId}/settlements`, {
        method: 'PUT',
        body: JSON.stringify({ settlementIds: assignedIds }),
      })
      setAssignUserId(null)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao salvar vínculos')
    } finally {
      setSavingAssign(false)
    }
  }

  if (loading) return <p className="text-center text-[15px] text-apple-secondary py-12">Carregando...</p>

  return (
    <div className="space-y-4">
      {message && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className={`text-[14px] font-medium rounded-2xl px-4 py-3 ${
            message.includes('sucesso') ? 'bg-apple-green/8 text-apple-green' : 'bg-apple-red/8 text-apple-red'
          }`}
        >
          {message}
        </motion.div>
      )}

      {/* Settlement assignment modal */}
      <AnimatePresence>
        {assignUserId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={() => setAssignUserId(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute bottom-0 left-0 right-0 sm:relative sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-apple-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-[0_-4px_40px_rgba(0,0,0,0.15)] sm:shadow-[0_24px_80px_rgba(0,0,0,0.2)] max-h-[85dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle for mobile */}
              <div className="w-10 h-1 rounded-full bg-apple-text/10 mx-auto mt-2.5 mb-1 sm:hidden" />

              <div className="px-5 pt-3">
                <h3 className="text-[17px] font-bold text-apple-text mb-1">Assentamentos Vinculados</h3>
                <p className="text-[13px] text-apple-secondary mb-4">
                  {userList.find((u) => u.id === assignUserId)?.name}
                </p>
              </div>

              {allSettlements.length === 0 ? (
                <p className="text-[14px] text-apple-tertiary text-center py-6 px-5">Nenhum assentamento cadastrado.</p>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto px-5">
                  {allSettlements.map((s) => {
                    const selected = assignedIds.includes(s.id)
                    return (
                      <motion.button
                        key={s.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleSettlement(s.id)}
                        className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                          selected
                            ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                            : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <span className={`w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            selected ? 'border-apple-green bg-apple-green' : 'border-apple-tertiary'
                          }`}>
                            {selected && (
                              <motion.svg
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                width="12" height="12" viewBox="0 0 12 12" fill="none"
                              >
                                <path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </motion.svg>
                            )}
                          </span>
                          <span>
                            <span className="block">{s.name}</span>
                            <span className="text-[12px] text-apple-secondary font-normal">{s.municipality}</span>
                          </span>
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-3 px-5 pt-4 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={saveAssignments}
                  disabled={savingAssign}
                  className="flex-1 bg-apple-green text-white rounded-2xl py-3.5 text-[16px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40"
                >
                  {savingAssign ? 'Salvando...' : `Salvar (${assignedIds.length})`}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setAssignUserId(null)}
                  className="px-5 rounded-2xl py-3.5 text-[16px] font-semibold bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
                >
                  Cancelar
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!showForm ? (
          <motion.div key="add-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => { setShowForm(true); setMessage('') }}
              className="flex items-center justify-center gap-2 w-full bg-apple-green text-white rounded-2xl py-4 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(34,163,82,0.25)]"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Novo Usuário
            </motion.button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleRegister}
            className="space-y-4"
          >
            <h2 className="text-[13px] font-semibold text-apple-secondary uppercase tracking-wide px-1">Novo Usuário</h2>

            <div className="bg-apple-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
              <div className="px-4 pt-3.5 pb-3">
                <label className="block text-[13px] font-medium text-apple-secondary mb-1">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                  placeholder="Nome completo"
                  required
                />
              </div>
              <div className="h-px bg-apple-separator mx-4" />
              <div className="px-4 pt-3.5 pb-3">
                <label className="block text-[13px] font-medium text-apple-secondary mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                  placeholder="email@exemplo.com"
                  required
                />
              </div>
              <div className="h-px bg-apple-separator mx-4" />
              <div className="px-4 pt-3.5 pb-3">
                <label className="block text-[13px] font-medium text-apple-secondary mb-1">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                  placeholder="********"
                  required
                />
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold text-apple-secondary uppercase tracking-wide px-1 mb-2">Perfil</h3>
              <div className="relative flex bg-apple-text/6 rounded-[10px] p-[2px]">
                <motion.div
                  className="absolute top-[2px] bottom-[2px] bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
                  initial={false}
                  animate={{
                    width: 'calc(50% - 2px)',
                    left: role === 'interviewer' ? '1px' : 'calc(50% + 1px)',
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
                <button
                  type="button"
                  onClick={() => setRole('interviewer')}
                  className={`relative z-10 flex-1 text-[14px] font-semibold py-2.5 rounded-[8px] transition-colors duration-200 ${
                    role === 'interviewer' ? 'text-apple-text' : 'text-apple-secondary'
                  }`}
                >
                  Entrevistador
                </button>
                <button
                  type="button"
                  onClick={() => setRole('viewer')}
                  className={`relative z-10 flex-1 text-[14px] font-semibold py-2.5 rounded-[8px] transition-colors duration-200 ${
                    role === 'viewer' ? 'text-apple-text' : 'text-apple-secondary'
                  }`}
                >
                  Visualizador
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <motion.button
                type="submit"
                disabled={saving}
                whileTap={{ scale: 0.97 }}
                className="flex-1 bg-apple-green text-white rounded-2xl py-3.5 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40"
              >
                {saving ? 'Cadastrando...' : 'Cadastrar'}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowForm(false)}
                className="px-6 rounded-2xl py-3.5 text-[17px] font-semibold bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
              >
                Cancelar
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-2.5">
        {userList.map((u, i) => (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-apple-text">{u.name}</p>
                  <span className={`text-[11px] font-semibold px-2 py-[2px] rounded-full whitespace-nowrap ${roleStyles[u.role] ?? roleStyles.viewer}`}>
                    {roleLabels[u.role] ?? u.role}
                  </span>
                </div>
                <p className="text-[13px] text-apple-secondary mt-0.5">{u.email}</p>
              </div>
            </div>
            {/* Actions - always full row for mobile friendliness */}
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-apple-separator">
              {u.role !== 'admin' && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => openAssign(u.id)}
                  className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-orange/10 text-apple-orange hover:bg-apple-orange/18 transition-colors"
                >
                  Assentamentos
                </motion.button>
              )}
              {u.id !== currentUser?.id && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfirmDeleteId(u.id)}
                  className="text-[13px] font-semibold h-8 px-4 rounded-full bg-apple-red/8 text-apple-red hover:bg-apple-red/14 transition-colors"
                >
                  Excluir
                </motion.button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <DestructiveSheet
        open={confirmDeleteId !== null}
        title="Excluir usuário?"
        message={`"${userList.find(u => u.id === confirmDeleteId)?.name ?? ''}" será removido permanentemente.`}
        onConfirm={() => { if (confirmDeleteId !== null) handleDelete(confirmDeleteId) }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
