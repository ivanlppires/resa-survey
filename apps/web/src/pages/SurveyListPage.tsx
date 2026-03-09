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
