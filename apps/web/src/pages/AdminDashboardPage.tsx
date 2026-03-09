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

interface SurveyOverview {
  id: number
  settlementId: number
  lotNumber: string | null
  status: string
  createdAt: string
  completedAt: string | null
}

type Tab = 'overview' | 'settlements' | 'users'

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
  const completed = surveys.filter(s => s.status === 'completed').length

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

function SettlementsTab() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [biome, setBiome] = useState('')
  const [saving, setSaving] = useState(false)

  const loadSettlements = () => {
    apiFetch<Settlement[]>('/settlements').then(setSettlements).finally(() => setLoading(false))
  }

  useEffect(() => { loadSettlements() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/admin/settlements', {
        method: 'POST',
        body: JSON.stringify({ name, municipality, biome }),
      })
      setName('')
      setMunicipality('')
      setBiome('')
      setShowForm(false)
      loadSettlements()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await apiFetch(`/admin/settlements/${id}`, { method: 'DELETE' })
    loadSettlements()
  }

  if (loading) return <p className="text-center text-gray-400 py-8">Carregando...</p>

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-green-600 text-white text-center rounded-2xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm"
      >
        {showForm ? 'Cancelar' : '+ Novo Assentamento'}
      </button>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Bioma</label>
            <input
              type="text"
              value={biome}
              onChange={(e) => setBiome(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: Pantanal"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      )}

      {settlements.length === 0 ? (
        <p className="text-center text-gray-400 py-8">Nenhum assentamento cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="text-sm text-gray-500">{s.municipality} · {s.biome}</p>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-sm px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UsersTab() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'interviewer' | 'viewer'>('interviewer')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-base font-medium text-gray-900">Cadastrar Novo Usuário</h2>
        {message && (
          <div className={`text-sm rounded-xl p-3 ${message.includes('sucesso') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {message}
          </div>
        )}
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
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? 'Cadastrando...' : 'Cadastrar Usuário'}
        </button>
      </form>
    </div>
  )
}
