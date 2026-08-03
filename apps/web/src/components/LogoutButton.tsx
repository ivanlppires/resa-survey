import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../lib/auth'

/**
 * Botão "Sair" com proteção offline. Deslogar apaga a sessão local
 * (token + usuário no localStorage), e como o login exige rede, sair
 * sem internet deixaria o entrevistador preso na tela de login em campo.
 * Por isso, quando offline, exigimos confirmação explícita. Os
 * questionários ficam no IndexedDB e não são afetados pelo logout.
 */
export default function LogoutButton() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [confirmOffline, setConfirmOffline] = useState(false)

  const doLogout = () => {
    setConfirmOffline(false)
    logout()
    navigate('/login')
  }

  const handleClick = () => {
    if (navigator.onLine) doLogout()
    else setConfirmOffline(true)
  }

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className="text-[14px] font-semibold h-9 px-4 rounded-full bg-apple-text/5 text-apple-secondary hover:bg-apple-text/8 transition-colors flex items-center gap-1.5"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sair
      </motion.button>

      {confirmOffline && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmOffline(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              className="w-full max-w-lg bg-apple-card rounded-t-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-3 text-center">
                <div className="w-11 h-11 rounded-full bg-apple-orange/12 flex items-center justify-center mx-auto mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                </div>
                <p className="text-[17px] font-bold text-apple-text">Você está sem internet</p>
                <p className="text-[14px] text-apple-secondary mt-1">
                  Se sair agora, não conseguirá entrar novamente até ter conexão. Seus questionários continuam salvos neste aparelho.
                </p>
              </div>
              <div className="px-5 pb-5 space-y-2">
                <button
                  onClick={doLogout}
                  className="w-full h-12 rounded-xl bg-apple-red text-white text-[16px] font-semibold hover:bg-apple-red/90 transition-colors"
                >
                  Sair mesmo assim
                </button>
                <button
                  onClick={() => setConfirmOffline(false)}
                  className="w-full h-12 rounded-xl bg-apple-text/5 text-[16px] font-semibold text-apple-text hover:bg-apple-text/8 transition-colors"
                  style={{ marginBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  Continuar conectado
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
