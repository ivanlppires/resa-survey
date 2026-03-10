import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { db, type LocalQuestion } from '../lib/db'
import { getQuestions } from '../lib/sync'

const sectionLabels = {
  socioeconomic: 'Socioec.',
  behavioral: 'Comport.',
  environmental: 'Ambiental',
} as const

const sectionFullLabels = {
  socioeconomic: 'Socioeconômico',
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

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-[15px] text-apple-secondary">Carregando...</p>
      </div>
    )
  }

  const activeIndex = sections.indexOf(currentSection)

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-apple-text/5 z-50">
        <motion.div
          className="h-full bg-apple-green rounded-r-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Glass header */}
      <header className="bg-apple-glass backdrop-blur-2xl sticky top-[3px] z-10 border-b border-apple-glass-border safe-top">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full bg-apple-text/5 flex items-center justify-center hover:bg-apple-text/8 transition-colors"
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M7 1L1 7l6 6" stroke="#1B1B1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
          <div className="text-center">
            <span className="text-[13px] font-semibold text-apple-secondary">{Math.round(progress)}%</span>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>

        {/* Segmented control */}
        <div className="max-w-lg mx-auto px-5 pb-3">
          <div className="relative flex bg-apple-text/6 rounded-[10px] p-[2px]">
            <motion.div
              className="absolute top-[2px] bottom-[2px] bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
              initial={false}
              animate={{
                width: `calc(${100 / sections.length}% - 2px)`,
                left: `calc(${(activeIndex * 100) / sections.length}% + 1px)`,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
            {sections.map((s) => (
              <button
                key={s}
                onClick={() => setCurrentSection(s)}
                className={`relative z-10 flex-1 text-[13px] font-semibold py-2 rounded-[8px] transition-colors duration-200 ${
                  currentSection === s ? 'text-apple-text' : 'text-apple-secondary'
                }`}
              >
                <span className="sm:hidden">{sectionLabels[s]}</span>
                <span className="hidden sm:inline">{sectionFullLabels[s]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-5 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="space-y-3.5"
          >
            {sectionQuestions.map((q, i) => (
              <motion.div
                key={q.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
              >
                <QuestionCard
                  question={q}
                  value={responses.get(q.key)}
                  onChange={(val) => saveResponse(q.key, val)}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {currentSection === 'environmental' && (
          <div className="mt-6 safe-bottom pb-4">
            <motion.button
              onClick={handleComplete}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="w-full bg-apple-green text-white rounded-2xl py-4 text-[17px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_12px_rgba(34,163,82,0.25)]"
            >
              Finalizar Questionário
            </motion.button>
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
    <div className="bg-apple-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
      <p className="text-[12px] font-semibold text-apple-green tracking-wide uppercase mb-1">Pergunta {question.number}</p>
      <p className="text-[16px] font-semibold text-apple-text leading-snug mb-4">{question.text}</p>

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
          className="w-full rounded-xl bg-apple-bg px-4 py-3 text-[16px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 min-h-[80px] placeholder:text-apple-tertiary transition-shadow"
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
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <div key={opt.value}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange(opt.value)}
              className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                selected
                  ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                  : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selected ? 'border-apple-green bg-apple-green' : 'border-apple-tertiary'
                }`}>
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 rounded-full bg-white"
                    />
                  )}
                </span>
                {opt.label}
              </span>
            </motion.button>
            {opt.hasTextInput && selected && (
              <input
                type="text"
                value={textInputs[opt.value] ?? ''}
                onChange={(e) => {
                  setTextInputs((prev) => ({ ...prev, [opt.value]: e.target.value }))
                  onChange(`${opt.value}:${e.target.value}`)
                }}
                className="mt-2 w-full rounded-xl bg-apple-bg px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 placeholder:text-apple-tertiary transition-shadow"
                placeholder="Especifique..."
              />
            )}
          </div>
        )
      })}
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
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => toggle(opt.value)}
              className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                selected
                  ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                  : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selected ? 'border-apple-green bg-apple-green' : 'border-apple-tertiary'
                }`}>
                  {selected && (
                    <motion.svg
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                    >
                      <path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </motion.svg>
                  )}
                </span>
                {opt.label}
              </span>
            </motion.button>
            {opt.hasTextInput && selected && (
              <input
                type="text"
                value={textInputs[opt.value] ?? ''}
                onChange={(e) => setTextInputs((prev) => ({ ...prev, [opt.value]: e.target.value }))}
                className="mt-2 w-full rounded-xl bg-apple-bg px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 placeholder:text-apple-tertiary transition-shadow"
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
    <div className="flex gap-2 justify-center flex-wrap">
      {points.map((n) => (
        <motion.button
          key={n}
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(n)}
          className={`w-12 h-12 rounded-[14px] text-[16px] font-semibold transition-all ${
            value === n
              ? 'bg-apple-green text-white shadow-[0_2px_8px_rgba(34,163,82,0.3)]'
              : 'bg-apple-bg text-apple-text hover:bg-apple-text/6'
          }`}
        >
          {n}
        </motion.button>
      ))}
    </div>
  )
}
