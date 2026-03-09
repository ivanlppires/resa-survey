import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router'
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
  admin: 'Administrador',
  interviewer: 'Entrevistador',
  viewer: 'Visualizador',
}

export default function AdminDashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-10 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">RESA Admin</h1>
            <p className="text-xs text-gray-500">{user?.name}</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Sair
          </button>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1">
          {([
            ['overview', 'Visão Geral'],
            ['settlements', 'Assentamentos'],
            ['users', 'Usuários'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
                tab === key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'settlements' && <SettlementsTab />}
        {tab === 'users' && <UsersTab />}
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

  if (loading) return <p className="text-center text-gray-400 py-8">Carregando...</p>

  const synced = surveys.filter(s => s.status === 'synced').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Questionários" value={surveys.length} />
        <StatCard label="Sincronizados" value={synced} />
        <StatCard label="Assentamentos" value={settlements.length} />
      </div>

      {surveys.length === 0 ? (
        <p className="text-center text-gray-400 py-8">Nenhum questionário sincronizado ainda.</p>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500">Últimos questionários</h2>
          {surveys.slice(0, 10).map((s) => {
            const settlement = settlements.find(st => st.id === s.settlementId)
            return (
              <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{settlement?.name ?? `Assentamento #${s.settlementId}`}</p>
                    <p className="text-sm text-gray-500">
                      {s.lotNumber ? `Lote ${s.lotNumber} · ` : ''}
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    s.status === 'synced' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {s.status === 'synced' ? 'Sincronizado' : s.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

const BIOMES = ['Amazônia', 'Caatinga', 'Cerrado', 'Mata Atlântica', 'Pampa', 'Pantanal']

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

  if (loading) return <p className="text-center text-gray-400 py-8">Carregando...</p>

  return (
    <div className="space-y-4">
      {editingId === null && (
        <button
          onClick={startNew}
          className="w-full bg-green-600 text-white text-center rounded-2xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm"
        >
          + Novo Assentamento
        </button>
      )}

      {editingId !== null && (
        <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="text-base font-medium text-gray-900">
            {editingId === 'new' ? 'Novo Assentamento' : 'Editar Assentamento'}
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: PA Nova Esperança"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Município</label>
            <input
              type="text"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: Cáceres"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bioma(s)</label>
            <div className="grid grid-cols-2 gap-2">
              {BIOMES.map((b) => {
                const selected = selectedBiomes.includes(b)
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBiome(b)}
                    className={`text-left px-3 py-2 rounded-xl border text-sm font-medium transition-all active:scale-[0.98] ${
                      selected
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {selected ? '✓ ' : ''}{b}
                  </button>
                )
              })}
            </div>
            {selectedBiomes.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Selecione pelo menos um bioma</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="px-6 rounded-xl py-3 text-base font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {settlements.length === 0 && editingId === null ? (
        <p className="text-center text-gray-400 py-8">Nenhum assentamento cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{s.name}</p>
                  <p className="text-sm text-gray-500">{s.municipality} · {s.biome}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(s)}
                    className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Editar
                  </button>
                  {confirmDeleteId === s.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </div>
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

  if (loading) return <p className="text-center text-gray-400 py-8">Carregando...</p>

  return (
    <div className="space-y-4">
      {message && (
        <div className={`text-sm rounded-xl p-3 ${message.includes('sucesso') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {message}
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => { setShowForm(true); setMessage('') }}
          className="w-full bg-green-600 text-white text-center rounded-2xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm"
        >
          + Novo Usuário
        </button>
      )}

      {showForm && (
        <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="text-base font-medium text-gray-900">Cadastrar Novo Usuário</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Nome completo"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="email@exemplo.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="******"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'interviewer' | 'viewer')}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="interviewer">Entrevistador</option>
              <option value="viewer">Visualizador</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? 'Cadastrando...' : 'Cadastrar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-6 rounded-xl py-3 text-base font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {userList.map((u) => (
          <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{u.name}</p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                  u.role === 'interviewer' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {roleLabels[u.role] ?? u.role}
                </span>
                {u.id !== currentUser?.id && (
                  confirmDeleteId === u.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(u.id)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Excluir
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
