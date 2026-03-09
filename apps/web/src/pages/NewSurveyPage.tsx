import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
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
    <div className="min-h-screen bg-[#F5F5F7]">
      <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-10 border-b border-gray-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-900">
            &larr; Voltar
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Novo Questionário</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assentamento</label>
            {settlements.length > 0 ? (
              <select
                value={settlementId}
                onChange={(e) => setSettlementId(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              >
                <option value="">Selecione...</option>
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} &mdash; {s.municipality}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400 py-3">Nenhum assentamento cadastrado. Peça ao admin para cadastrar.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número do Lote</label>
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: 42"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !settlementId}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Iniciar Questionário'}
          </button>
        </form>
      </main>
    </div>
  )
}
