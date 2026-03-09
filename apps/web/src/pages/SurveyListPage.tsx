import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import { db, type LocalSurvey } from '../lib/db'
import { syncCompletedSurveys, syncQuestions } from '../lib/sync'

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  synced: 'Sincronizado',
}

const statusStyles: Record<string, string> = {
  draft: 'bg-apple-secondary/10 text-apple-secondary',
  in_progress: 'bg-apple-orange/12 text-apple-orange',
  completed: 'bg-apple-blue/12 text-apple-blue',
  synced: 'bg-apple-green/12 text-apple-green',
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
    <div className="min-h-screen bg-apple-bg">
      {/* Glass header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-0 z-10 border-b border-apple-glass-border">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-bold text-apple-text tracking-tight">RESA Survey</h1>
            <p className="text-[13px] text-apple-secondary">{user?.name}</p>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSync}
              disabled={syncing}
              className="text-[14px] font-semibold px-3.5 py-[7px] rounded-full bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors disabled:opacity-40"
            >
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { logout(); navigate('/login') }}
              className="text-[14px] font-semibold px-3.5 py-[7px] rounded-full bg-apple-text/5 text-apple-secondary hover:bg-apple-text/8 transition-colors"
            >
              Sair
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6">
        <motion.div whileTap={{ scale: 0.98 }}>
          <Link
            to="/survey/new"
            className="flex items-center justify-center gap-2 w-full bg-apple-green text-white rounded-2xl py-[15px] text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(52,199,89,0.25)]"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            Novo Questionário
          </Link>
        </motion.div>

        {surveys.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mt-16"
          >
            <div className="w-12 h-12 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86868B" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
              </svg>
            </div>
            <p className="text-[15px] text-apple-secondary">Nenhum questionário ainda</p>
          </motion.div>
        ) : (
          <div className="mt-6 space-y-2.5">
            {surveys.map((s, i) => (
              <motion.div
                key={s.localId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <Link
                  to={s.status === 'synced' ? '#' : `/survey/${s.localId}`}
                  className="flex items-center justify-between bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_20px_rgba(0,0,0,0.06)] transition-shadow active:scale-[0.98]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-apple-text truncate">{s.settlementName}</p>
                    <p className="text-[13px] text-apple-secondary mt-0.5">
                      Lote {s.lotNumber} · {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`text-[12px] font-semibold px-2.5 py-[3px] rounded-full whitespace-nowrap ${statusStyles[s.status]}`}>
                      {statusLabels[s.status]}
                    </span>
                    {s.status !== 'synced' && (
                      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="text-apple-tertiary flex-shrink-0">
                        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
