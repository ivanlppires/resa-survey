import { useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
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
    <div className="min-h-dvh bg-apple-bg flex flex-col items-center justify-center px-6 safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-[380px]"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="w-[72px] h-[72px] rounded-[20px] bg-apple-green/10 flex items-center justify-center mx-auto mb-5">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22A352" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M8 12l2.5 2.5L16 9"/>
              </svg>
            </div>
            <h1 className="text-[34px] font-extrabold tracking-tight text-apple-text">RESA</h1>
            <p className="text-[15px] text-apple-secondary mt-1.5">Pesquisa Socioeconômica e Ambiental</p>
          </motion.div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-apple-red/8 text-apple-red text-[14px] font-medium rounded-2xl px-4 py-3 mb-4"
            >
              {error}
            </motion.div>
          )}

          <div className="bg-apple-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
            <div className="px-4 pt-3.5 pb-3">
              <label className="block text-[13px] font-medium text-apple-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                placeholder="seu@email.com"
                required
                autoComplete="email"
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
                autoComplete="current-password"
              />
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full mt-5 bg-apple-green text-white rounded-2xl py-4 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40 shadow-[0_2px_8px_rgba(34,163,82,0.3)]"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
