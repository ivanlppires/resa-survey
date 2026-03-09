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
  lotNumber: string | null
  status: string
  createdAt: string
  completedAt: string | null
}

type Tab = 'overview' | 'settlements' | 'users'

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

export default function AdminDashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'settlements', label: 'Assentamentos' },
    { key: 'users', label: 'Usuários' },
  ]

  const activeIndex = tabs.findIndex(t => t.key === tab)

  return (
    <div className="min-h-screen bg-apple-bg">
      {/* Glass header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-0 z-10 border-b border-apple-glass-border">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-bold text-apple-text tracking-tight">RESA Admin</h1>
            <p className="text-[13px] text-apple-secondary">{user?.name}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { logout(); navigate('/login') }}
            className="text-[14px] font-semibold px-3.5 py-[7px] rounded-full bg-apple-text/5 text-apple-secondary hover:bg-apple-text/8 transition-colors"
          >
            Sair
          </motion.button>
        </div>

        {/* Segmented control */}
        <div className="max-w-2xl mx-auto px-5 pb-3">
          <div className="relative flex bg-apple-text/6 rounded-[10px] p-[2px]">
            <motion.div
              className="absolute top-[2px] bottom-[2px] bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
              initial={false}
              animate={{
                width: `calc(${100 / tabs.length}% - 2px)`,
                left: `calc(${(activeIndex * 100) / tabs.length}% + 1px)`,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative z-10 flex-1 text-[13px] font-semibold py-[7px] rounded-[8px] transition-colors duration-200 ${
                  tab === t.key ? 'text-apple-text' : 'text-apple-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'overview' && <OverviewTab />}
            {tab === 'settlements' && <SettlementsTab />}
            {tab === 'users' && <UsersTab />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function OverviewTab() {
  const [surveys, setSurveys] = useState<SurveyOverview[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<SurveyOverview[]>('/surveys'),
      apiFetch<Settlement[]>('/settlements'),
    ]).then(([s, st]) => {
      setSurveys(s)
      setSettlements(st)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-center text-[15px] text-apple-secondary py-12">Carregando...</p>

  const synced = surveys.filter(s => s.status === 'synced').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Questionários', value: surveys.length, color: 'text-apple-blue' },
          { label: 'Sincronizados', value: synced, color: 'text-apple-green' },
          { label: 'Assentamentos', value: settlements.length, color: 'text-apple-orange' },
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
          <div className="w-12 h-12 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86868B" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
          </div>
          <p className="text-[15px] text-apple-secondary">Nenhum questionário sincronizado ainda.</p>
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
              className="flex items-center justify-center gap-2 w-full bg-apple-green text-white rounded-2xl py-[14px] text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(52,199,89,0.25)]"
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

            {/* Grouped inputs */}
            <div className="bg-apple-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
              <div className="px-4 pt-3 pb-2.5">
                <label className="block text-[13px] font-medium text-apple-secondary mb-0.5">Nome</label>
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
              <div className="px-4 pt-3 pb-2.5">
                <label className="block text-[13px] font-medium text-apple-secondary mb-0.5">Município</label>
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

            {/* Biome selection */}
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
                      className={`flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-all ${
                        selected
                          ? 'bg-apple-green text-white shadow-[0_2px_8px_rgba(52,199,89,0.25)]'
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
                className="flex-1 bg-apple-green text-white rounded-[14px] py-[13px] text-[17px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={cancel}
                className="px-6 rounded-[14px] py-[13px] text-[17px] font-semibold bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
              >
                Cancelar
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {settlements.length === 0 && editingId === null ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86868B" strokeWidth="1.5">
              <path d="M3 21h18M3 7v14M21 7v14M6 7V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"/>
              <path d="M9 21v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4"/>
            </svg>
          </div>
          <p className="text-[15px] text-apple-secondary">Nenhum assentamento cadastrado.</p>
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
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-apple-text">{s.name}</p>
                  <p className="text-[13px] text-apple-secondary mt-0.5">{s.municipality} · {s.biome}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => startEdit(s)}
                    className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
                  >
                    Editar
                  </motion.button>
                  {confirmDeleteId === s.id ? (
                    <div className="flex gap-1.5">
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleDelete(s.id)}
                        className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-red text-white"
                      >
                        Sim
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-text/5 text-apple-text"
                      >
                        Não
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-red/8 text-apple-red hover:bg-apple-red/14 transition-colors"
                    >
                      Excluir
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function UsersTab() {
  const { user: currentUser } = useAuth()
  const [userList, setUserList] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'interviewer' | 'viewer'>('interviewer')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const loadUsers = () => {
    apiFetch<UserInfo[]>('/admin/users').then(setUserList).finally(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [])

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

      <AnimatePresence mode="wait">
        {!showForm ? (
          <motion.div key="add-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => { setShowForm(true); setMessage('') }}
              className="flex items-center justify-center gap-2 w-full bg-apple-green text-white rounded-2xl py-[14px] text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(52,199,89,0.25)]"
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

            {/* Grouped inputs */}
            <div className="bg-apple-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
              <div className="px-4 pt-3 pb-2.5">
                <label className="block text-[13px] font-medium text-apple-secondary mb-0.5">Nome</label>
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
              <div className="px-4 pt-3 pb-2.5">
                <label className="block text-[13px] font-medium text-apple-secondary mb-0.5">Email</label>
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
              <div className="px-4 pt-3 pb-2.5">
                <label className="block text-[13px] font-medium text-apple-secondary mb-0.5">Senha</label>
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

            {/* Role segmented control */}
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
                  className={`relative z-10 flex-1 text-[14px] font-semibold py-[8px] rounded-[8px] transition-colors duration-200 ${
                    role === 'interviewer' ? 'text-apple-text' : 'text-apple-secondary'
                  }`}
                >
                  Entrevistador
                </button>
                <button
                  type="button"
                  onClick={() => setRole('viewer')}
                  className={`relative z-10 flex-1 text-[14px] font-semibold py-[8px] rounded-[8px] transition-colors duration-200 ${
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
                className="flex-1 bg-apple-green text-white rounded-[14px] py-[13px] text-[17px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40"
              >
                {saving ? 'Cadastrando...' : 'Cadastrar'}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowForm(false)}
                className="px-6 rounded-[14px] py-[13px] text-[17px] font-semibold bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors"
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
                <p className="text-[15px] font-semibold text-apple-text">{u.name}</p>
                <p className="text-[13px] text-apple-secondary mt-0.5">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className={`text-[12px] font-semibold px-2.5 py-[3px] rounded-full whitespace-nowrap ${roleStyles[u.role] ?? roleStyles.viewer}`}>
                  {roleLabels[u.role] ?? u.role}
                </span>
                {u.id !== currentUser?.id && (
                  confirmDeleteId === u.id ? (
                    <div className="flex gap-1.5">
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleDelete(u.id)}
                        className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-red text-white"
                      >
                        Sim
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-text/5 text-apple-text"
                      >
                        Não
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setConfirmDeleteId(u.id)}
                      className="text-[13px] font-semibold px-3 py-[5px] rounded-full bg-apple-red/8 text-apple-red hover:bg-apple-red/14 transition-colors"
                    >
                      Excluir
                    </motion.button>
                  )
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
