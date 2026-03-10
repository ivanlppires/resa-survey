import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import { db, type LocalSurvey } from '../lib/db'
import { syncCompletedSurveys, syncQuestions } from '../lib/sync'
import ChangePasswordModal from '../components/ChangePasswordModal'

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
  const [showPasswordModal, setShowPasswordModal] = useState(false)

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
    <div className="min-h-dvh flex flex-col">
      {/* Glass header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-0 z-10 border-b border-apple-glass-border safe-top">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-apple-text tracking-tight">RESA</h1>
            <p className="text-[13px] text-apple-secondary">{user?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSync}
              disabled={syncing}
              className="text-[14px] font-semibold h-9 px-4 rounded-full bg-apple-text/5 text-apple-text hover:bg-apple-text/8 transition-colors disabled:opacity-40"
            >
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowPasswordModal(true)}
              className="w-9 h-9 rounded-full bg-apple-text/5 flex items-center justify-center text-apple-secondary hover:bg-apple-text/8 transition-colors"
              title="Alterar senha"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { logout(); navigate('/login') }}
              className="text-[14px] font-semibold h-9 px-4 rounded-full bg-apple-text/5 text-apple-secondary hover:bg-apple-text/8 transition-colors flex items-center gap-1.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </motion.button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-5 pb-28 md:pb-5">
        {/* Desktop action bar */}
        <div className="hidden md:flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[18px] font-bold text-apple-text">Questionários</h2>
            <p className="text-[13px] text-apple-secondary">{surveys.length} {surveys.length === 1 ? 'registro' : 'registros'}</p>
          </div>
          <Link
            to="/survey/new"
            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-apple-green text-white text-[14px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_8px_rgba(34,163,82,0.25)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Novo Questionário
          </Link>
        </div>

        {surveys.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mt-20"
          >
            <div className="w-14 h-14 rounded-full bg-apple-secondary/8 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#808086" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
              </svg>
            </div>
            <p className="text-[16px] font-medium text-apple-secondary">Nenhum questionário ainda</p>
            <p className="text-[14px] text-apple-tertiary mt-1">Toque no botão + para iniciar</p>
          </motion.div>
        ) : (
          <div className="space-y-2.5">
            {surveys.map((s, i) => (
              <motion.div
                key={s.localId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <Link
                  to={s.status === 'synced' ? '#' : `/survey/${s.localId}`}
                  className="flex items-center justify-between bg-apple-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
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

      {/* Floating Action Button - mobile only */}
      <div className="fixed bottom-6 right-5 safe-bottom z-20 max-w-lg md:hidden" style={{ right: 'max(1.25rem, calc((100vw - 32rem) / 2 + 1.25rem))' }}>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.3 }}
        >
          <Link
            to="/survey/new"
            className="flex items-center justify-center w-[60px] h-[60px] rounded-full bg-apple-green text-white shadow-[0_4px_20px_rgba(34,163,82,0.4),0_1px_3px_rgba(0,0,0,0.1)] active:scale-95 transition-transform"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 6v16M6 14h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </Link>
        </motion.div>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  )
}
