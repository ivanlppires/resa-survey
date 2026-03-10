import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { apiFetch } from '../lib/api'

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) { setError('A nova senha deve ter no mínimo 6 caracteres'); return }
    if (newPassword !== confirmPassword) { setError('As senhas não coincidem'); return }
    setLoading(true)
    try {
      await apiFetch('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) })
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-5"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-apple-card rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] w-full max-w-[380px] overflow-hidden"
        >
          <div className="px-5 pt-5 pb-2">
            <h2 className="text-[18px] font-bold text-apple-text">Alterar Senha</h2>
            <p className="text-[13px] text-apple-secondary mt-1">Digite sua senha atual e a nova senha</p>
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
            {error && (
              <div className="bg-apple-red/8 text-apple-red text-[13px] font-medium rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-apple-green/8 text-apple-green text-[13px] font-medium rounded-xl px-3.5 py-2.5">
                Senha alterada com sucesso!
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-apple-secondary mb-1">Senha atual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-apple-grouped rounded-xl px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 transition-shadow"
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-apple-secondary mb-1">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-apple-grouped rounded-xl px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 transition-shadow"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-apple-secondary mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-apple-grouped rounded-xl px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 transition-shadow"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-apple-text/5 text-[15px] font-semibold text-apple-secondary hover:bg-apple-text/8 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || success}
                className="flex-1 h-11 rounded-xl bg-apple-green text-white text-[15px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
