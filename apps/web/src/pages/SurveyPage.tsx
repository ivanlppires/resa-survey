import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { db, type LocalQuestion } from '../lib/db'
import { getQuestions } from '../lib/sync'

const sectionLabels = {
  socioeconomic: 'Socioeconomico',
  behavioral: 'Comportamental',
  environmental: 'Ambiental',
} as const

type Section = keyof typeof sectionLabels

export default function SurveyPage() {
  const { localId } = useParams<{ localId: string }>()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<LocalQuestion[]>([])
  const [responses, setResponses] = useState<Map<string, unknown>>(new Map())
  const [currentSection, setCurrentSection] = useState<Section>('socioeconomic')
  const [loading, setLoading] = useState(true)

  const sections: Section[] = ['socioeconomic', 'behavioral', 'environmental']

  useEffect(() => {
    async function load() {
      const qs = await getQuestions()
      setQuestions(qs)
      const existing = await db.responses.where('surveyLocalId').equals(localId!).toArray()
      const map = new Map<string, unknown>()
      existing.forEach((r) => map.set(r.questionKey, r.value))
      setResponses(map)
      setLoading(false)
    }
    load()
  }, [localId])

  const saveResponse = useCallback(async (questionKey: string, value: unknown) => {
    setResponses((prev) => new Map(prev).set(questionKey, value))

    const existing = await db.responses
      .where('[surveyLocalId+questionKey]')
      .equals([localId!, questionKey])
      .first()

    const now = new Date().toISOString()
    if (existing) {
      await db.responses.update(existing.id!, { value, answeredAt: now })
    } else {
      await db.responses.add({ surveyLocalId: localId!, questionKey, value, answeredAt: now })
    }

    await db.surveys.where('localId').equals(localId!).modify({ updatedAt: now })
  }, [localId])

  const handleComplete = async () => {
    const now = new Date().toISOString()
    await db.surveys.where('localId').equals(localId!).modify({
      status: 'completed' as const,
      completedAt: now,
      updatedAt: now,
    })
    navigate('/')
  }

  const sectionQuestions = questions.filter((q) => {
    if (q.section !== currentSection) return false
    if (q.conditional) {
      const parentValue = responses.get(q.conditional.dependsOn)
      if (!parentValue || !q.conditional.showWhen.includes(parentValue as string)) return false
    }
    return true
  })

  const totalQuestions = questions.filter((q) => !q.conditional).length
  const answeredCount = responses.size
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0

  if (loading) return <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center"><p className="text-gray-400">Carregando...</p></div>

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 z-50">
        <motion.div
          className="h-full bg-green-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <header className="bg-white/80 backdrop-blur-lg sticky top-1 z-10 border-b border-gray-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-900">&larr; Voltar</button>
          <span className="text-sm text-gray-500">{Math.round(progress)}% concluido</span>
        </div>
        {/* Section tabs */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-1">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setCurrentSection(s)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
                currentSection === s
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sectionLabels[s]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {sectionQuestions.map((q) => (
              <QuestionCard
                key={q.key}
                question={q}
                value={responses.get(q.key)}
                onChange={(val) => saveResponse(q.key, val)}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {currentSection === 'environmental' && (
          <div className="mt-8">
            <button
              onClick={handleComplete}
              className="w-full bg-green-600 text-white rounded-2xl py-4 text-base font-medium hover:bg-green-700 active:scale-[0.98] transition-all"
            >
              Finalizar Questionario
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function QuestionCard({ question, value, onChange }: {
  question: LocalQuestion
  value: unknown
  onChange: (val: unknown) => void
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="text-sm text-gray-400 mb-1">Pergunta {question.number}</p>
      <p className="font-medium text-gray-900 mb-4">{question.text}</p>

      {question.type === 'single_choice' && question.options && (
        <SingleChoice options={question.options} value={value as string} onChange={onChange} />
      )}
      {question.type === 'multiple_choice' && question.options && (
        <MultipleChoice options={question.options} value={(value as string[]) ?? []} onChange={onChange} />
      )}
      {question.type === 'yes_no' && question.options && (
        <SingleChoice options={question.options} value={value as string} onChange={onChange} />
      )}
      {question.type === 'scale' && (
        <ScaleInput min={question.scaleMin ?? 1} max={question.scaleMax ?? 5} value={value as number} onChange={onChange} />
      )}
      {question.type === 'text' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[80px]"
          placeholder="Digite sua resposta..."
        />
      )}
    </div>
  )
}

function SingleChoice({ options, value, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string
  onChange: (val: string) => void
}) {
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <div key={opt.value}>
          <button
            onClick={() => onChange(opt.value)}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
              value === opt.value
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
          {opt.hasTextInput && value === opt.value && (
            <input
              type="text"
              value={textInputs[opt.value] ?? ''}
              onChange={(e) => {
                setTextInputs((prev) => ({ ...prev, [opt.value]: e.target.value }))
                onChange(`${opt.value}:${e.target.value}`)
              }}
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Especifique..."
            />
          )}
        </div>
      ))}
    </div>
  )
}

function MultipleChoice({ options, value, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string[]
  onChange: (val: string[]) => void
}) {
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

  const toggle = (optValue: string) => {
    const next = value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value)
        return (
          <div key={opt.value}>
            <button
              onClick={() => toggle(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
                selected
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-xs border ${
                  selected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                }`}>
                  {selected && '\u2713'}
                </span>
                {opt.label}
              </span>
            </button>
            {opt.hasTextInput && selected && (
              <input
                type="text"
                value={textInputs[opt.value] ?? ''}
                onChange={(e) => setTextInputs((prev) => ({ ...prev, [opt.value]: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Especifique..."
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScaleInput({ min, max, value, onChange }: {
  min: number
  max: number
  value: number
  onChange: (val: number) => void
}) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <div className="flex gap-2 justify-center">
      {points.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-12 h-12 rounded-xl border text-base font-medium transition-all active:scale-[0.95] ${
            value === n
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
