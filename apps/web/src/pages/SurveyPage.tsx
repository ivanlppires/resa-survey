import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { db, type LocalQuestion, type LocalSurvey } from '../lib/db'
import { getQuestions } from '../lib/sync'
import { computeProgress, isConditionMet, unansweredBySection } from '../lib/progress'

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
  const [survey, setSurvey] = useState<LocalSurvey | null>(null)
  const [questions, setQuestions] = useState<LocalQuestion[]>([])
  const [responses, setResponses] = useState<Map<string, unknown>>(new Map())
  const [textValues, setTextValues] = useState<Map<string, string>>(new Map())
  const [currentSection, setCurrentSection] = useState<Section>('socioeconomic')
  const [loading, setLoading] = useState(true)
  const [showConfirmFinish, setShowConfirmFinish] = useState(false)

  const sections: Section[] = ['socioeconomic', 'behavioral', 'environmental']
  const readOnly = survey?.status === 'synced'

  useEffect(() => {
    async function load() {
      const s = await db.surveys.where('localId').equals(localId!).first()
      setSurvey(s ?? null)
      const qs = await getQuestions()
      setQuestions(qs)
      const existing = await db.responses.where('surveyLocalId').equals(localId!).toArray()
      const values = new Map<string, unknown>()
      const texts = new Map<string, string>()
      existing.forEach((r) => {
        values.set(r.questionKey, r.value)
        if (r.textValue) texts.set(r.questionKey, r.textValue)
      })
      setResponses(values)
      setTextValues(texts)
      setLoading(false)
    }
    load()
  }, [localId])

  const saveResponse = useCallback(async (questionKey: string, value: unknown, textValue?: string) => {
    if (readOnly) return

    setResponses((prev) => new Map(prev).set(questionKey, value))
    setTextValues((prev) => {
      const next = new Map(prev)
      if (textValue !== undefined && textValue !== '') next.set(questionKey, textValue)
      else next.delete(questionKey)
      return next
    })

    const existing = await db.responses
      .where('[surveyLocalId+questionKey]')
      .equals([localId!, questionKey])
      .first()

    const now = new Date().toISOString()
    const storedText = textValue !== undefined && textValue !== '' ? textValue : undefined
    if (existing) {
      await db.responses.update(existing.id!, { value, textValue: storedText, answeredAt: now })
    } else {
      await db.responses.add({ surveyLocalId: localId!, questionKey, value, textValue: storedText, answeredAt: now })
    }
    await db.surveys.where('localId').equals(localId!).modify({ updatedAt: now })

    // Respostas de condicionais que ficaram ocultas são descartadas
    const nextValues = new Map(responses).set(questionKey, value)
    for (const child of questions) {
      if (child.conditional?.dependsOn !== questionKey) continue
      if (isConditionMet(child, nextValues)) continue
      if (!nextValues.has(child.key)) continue
      await db.responses.where('[surveyLocalId+questionKey]').equals([localId!, child.key]).delete()
      setResponses((prev) => {
        const next = new Map(prev)
        next.delete(child.key)
        return next
      })
      setTextValues((prev) => {
        const next = new Map(prev)
        next.delete(child.key)
        return next
      })
    }
  }, [localId, readOnly, responses, questions])

  const completeSurvey = async () => {
    const now = new Date().toISOString()
    await db.surveys.where('localId').equals(localId!).modify({
      status: 'completed' as const,
      completedAt: now,
      updatedAt: now,
    })
    navigate('/')
  }

  const sectionQuestions = questions.filter(
    (q) => q.section === currentSection && isConditionMet(q, responses)
  )

  const progress = computeProgress(questions, responses)
  const unanswered = unansweredBySection(questions, responses)
  const unansweredTotal = unanswered.socioeconomic + unanswered.behavioral + unanswered.environmental

  const handleFinishClick = () => {
    if (unansweredTotal > 0) setShowConfirmFinish(true)
    else completeSurvey()
  }

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
            {readOnly ? (
              <span className="text-[13px] font-semibold text-apple-green">Sincronizado · somente leitura</span>
            ) : (
              <span className="text-[13px] font-semibold text-apple-secondary">{progress}%</span>
            )}
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
                  textValue={textValues.get(q.key) ?? ''}
                  readOnly={!!readOnly}
                  onChange={(val, text) => saveResponse(q.key, val, text)}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {currentSection === 'environmental' && !readOnly && (
          <div className="mt-6 safe-bottom pb-4">
            <motion.button
              onClick={handleFinishClick}
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

      {createPortal(
        <AnimatePresence>
          {showConfirmFinish && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
              onClick={() => setShowConfirmFinish(false)}
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
                  <p className="text-[17px] font-bold text-apple-text">
                    {unansweredTotal} pergunta{unansweredTotal > 1 ? 's' : ''} sem resposta
                  </p>
                  <p className="text-[14px] text-apple-secondary mt-1">
                    {[
                      unanswered.socioeconomic > 0 ? `${unanswered.socioeconomic} Socioeconômico` : null,
                      unanswered.behavioral > 0 ? `${unanswered.behavioral} Comportamental` : null,
                      unanswered.environmental > 0 ? `${unanswered.environmental} Ambiental` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="px-5 pb-5 space-y-2">
                  <button
                    onClick={completeSurvey}
                    className="w-full h-12 rounded-xl bg-apple-green text-white text-[16px] font-semibold hover:bg-apple-green-hover transition-colors"
                  >
                    Finalizar mesmo assim
                  </button>
                  <button
                    onClick={() => setShowConfirmFinish(false)}
                    className="w-full h-12 rounded-xl bg-apple-text/5 text-[16px] font-semibold text-apple-text hover:bg-apple-text/8 transition-colors"
                    style={{ marginBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
                  >
                    Continuar respondendo
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

function QuestionCard({ question, value, textValue, readOnly, onChange }: {
  question: LocalQuestion
  value: unknown
  textValue: string
  readOnly: boolean
  onChange: (val: unknown, textValue?: string) => void
}) {
  return (
    <div className="bg-apple-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]">
      <p className="text-[12px] font-semibold text-apple-green tracking-wide uppercase mb-1">Pergunta {question.number}</p>
      <p className="text-[16px] font-semibold text-apple-text leading-snug mb-4">{question.text}</p>

      {(question.type === 'single_choice' || question.type === 'yes_no') && question.options && (
        <SingleChoice
          options={question.options}
          value={value as string}
          textValue={textValue}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
      {question.type === 'multiple_choice' && question.options && (
        <MultipleChoice
          options={question.options}
          value={(value as string[]) ?? []}
          textValue={textValue}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
      {question.type === 'scale' && (
        <ScaleInput
          min={question.scaleMin ?? 1}
          max={question.scaleMax ?? 5}
          value={value as number}
          readOnly={readOnly}
          onChange={(v) => onChange(v)}
        />
      )}
      {question.type === 'text' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className="w-full rounded-xl bg-apple-bg px-4 py-3 text-[16px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 min-h-[80px] placeholder:text-apple-tertiary transition-shadow disabled:opacity-60"
          placeholder="Digite sua resposta..."
        />
      )}
    </div>
  )
}

function OptionTextInput({ value, readOnly, onCommit }: {
  value: string
  readOnly: boolean
  onCommit: (text: string) => void
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      disabled={readOnly}
      className="mt-2 w-full rounded-xl bg-apple-bg px-4 py-3 text-[15px] text-apple-text outline-none focus:ring-2 focus:ring-apple-green/30 placeholder:text-apple-tertiary transition-shadow disabled:opacity-60"
      placeholder="Especifique..."
    />
  )
}

function SingleChoice({ options, value, textValue, readOnly, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string
  textValue: string
  readOnly: boolean
  onChange: (val: string, textValue?: string) => void
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <div key={opt.value}>
            <motion.button
              whileTap={readOnly ? undefined : { scale: 0.98 }}
              onClick={() => { if (!readOnly) onChange(opt.value, opt.hasTextInput ? textValue : undefined) }}
              disabled={readOnly}
              className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                selected
                  ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                  : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
              } ${readOnly ? 'cursor-default' : ''}`}
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
              <OptionTextInput
                value={textValue}
                readOnly={readOnly}
                onCommit={(text) => onChange(opt.value, text)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function MultipleChoice({ options, value, textValue, readOnly, onChange }: {
  options: { value: string; label: string; hasTextInput?: boolean }[]
  value: string[]
  textValue: string
  readOnly: boolean
  onChange: (val: string[], textValue?: string) => void
}) {
  const textOption = options.find((o) => o.hasTextInput)

  const toggle = (optValue: string) => {
    const next = value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]
    const keepText = textOption && next.includes(textOption.value) ? textValue : undefined
    onChange(next, keepText)
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value)
        return (
          <div key={opt.value}>
            <motion.button
              whileTap={readOnly ? undefined : { scale: 0.98 }}
              onClick={() => { if (!readOnly) toggle(opt.value) }}
              disabled={readOnly}
              className={`w-full text-left px-4 py-3.5 rounded-xl transition-all text-[15px] font-medium ${
                selected
                  ? 'bg-apple-green/10 text-apple-green ring-1 ring-apple-green/30'
                  : 'bg-apple-bg text-apple-text hover:bg-apple-text/4'
              } ${readOnly ? 'cursor-default' : ''}`}
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
              <OptionTextInput
                value={textValue}
                readOnly={readOnly}
                onCommit={(text) => onChange(value, text)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScaleInput({ min, max, value, readOnly, onChange }: {
  min: number
  max: number
  value: number
  readOnly: boolean
  onChange: (val: number) => void
}) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {points.map((n) => (
        <motion.button
          key={n}
          whileTap={readOnly ? undefined : { scale: 0.9 }}
          onClick={() => { if (!readOnly) onChange(n) }}
          disabled={readOnly}
          className={`w-12 h-12 rounded-[14px] text-[16px] font-semibold transition-all ${
            value === n
              ? 'bg-apple-green text-white shadow-[0_2px_8px_rgba(34,163,82,0.3)]'
              : 'bg-apple-bg text-apple-text hover:bg-apple-text/6'
          } ${readOnly ? 'cursor-default' : ''}`}
        >
          {n}
        </motion.button>
      ))}
    </div>
  )
}
