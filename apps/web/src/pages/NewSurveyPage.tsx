import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { db } from '../lib/db'
import { apiFetch } from '../lib/api'

interface Settlement {
  id: number
  name: string
  municipality: string
  biome: string
}

export default function NewSurveyPage() {
  const navigate = useNavigate()
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [settlementId, setSettlementId] = useState<number | ''>('')
  const [lotNumber, setLotNumber] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch<Settlement[]>('/settlements').then(setSettlements).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settlementId) return
    setLoading(true)

    const settlement = settlements.find((s) => s.id === settlementId)
    const localId = crypto.randomUUID()
    const now = new Date().toISOString()

    let gpsLat: number | null = null
    let gpsLng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      gpsLat = pos.coords.latitude
      gpsLng = pos.coords.longitude
    } catch {
      // GPS not available
    }

    await db.surveys.add({
      localId,
      settlementId: settlementId as number,
      settlementName: settlement?.name ?? 'Desconhecido',
      lotNumber,
      gpsLat,
      gpsLng,
      status: 'in_progress',
      deviceInfo: navigator.userAgent,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      syncedAt: null,
    })

    navigate(`/survey/${localId}`)
  }

  return (
    <div className="min-h-screen bg-apple-bg">
      {/* Glass header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-0 z-10 border-b border-apple-glass-border">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-full bg-apple-text/5 flex items-center justify-center hover:bg-apple-text/8 transition-colors"
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M7 1L1 7l6 6" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
          <h1 className="text-[20px] font-bold text-apple-text tracking-tight">Novo Questionário</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6">
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Apple-style grouped inputs */}
          <div className="bg-apple-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
            <div className="px-4 pt-3 pb-2.5">
              <label className="block text-[13px] font-medium text-apple-secondary mb-1">Assentamento</label>
              {settlements.length > 0 ? (
                <select
                  value={settlementId}
                  onChange={(e) => setSettlementId(Number(e.target.value))}
                  className="w-full bg-transparent text-[17px] text-apple-text outline-none appearance-none cursor-pointer"
                  required
                >
                  <option value="">Selecione...</option>
                  {settlements.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.municipality}</option>
                  ))}
                </select>
              ) : (
                <p className="text-[15px] text-apple-tertiary py-1">Nenhum assentamento cadastrado. Peça ao admin para cadastrar.</p>
              )}
            </div>
            <div className="h-px bg-apple-separator mx-4" />
            <div className="px-4 pt-3 pb-2.5">
              <label className="block text-[13px] font-medium text-apple-secondary mb-0.5">Número do Lote</label>
              <input
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                className="w-full bg-transparent text-[17px] text-apple-text outline-none placeholder:text-apple-tertiary"
                placeholder="Ex: 42"
                required
              />
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={loading || !settlementId}
            whileTap={{ scale: 0.97 }}
            className="w-full mt-5 bg-apple-green text-white rounded-[14px] py-[14px] text-[17px] font-semibold hover:bg-apple-green-hover transition-colors disabled:opacity-40 shadow-[0_2px_8px_rgba(52,199,89,0.3)]"
          >
            {loading ? 'Criando...' : 'Iniciar Questionário'}
          </motion.button>
        </motion.form>
      </main>
    </div>
  )
}
