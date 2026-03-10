import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface ToastData {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

const icons: Record<ToastData['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'i',
}

const styles: Record<ToastData['type'], string> = {
  success: 'bg-apple-green text-white',
  error: 'bg-apple-red text-white',
  info: 'bg-apple-text/80 text-white',
}

interface ToastContainerProps {
  toasts: ToastData[]
  onDismiss: (id: number) => void
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pointer-events-none safe-top pt-2 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: -40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-[14px] font-semibold mb-2 ${styles[toast.type]}`}
    >
      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[12px] font-bold flex-shrink-0">
        {icons[toast.type]}
      </span>
      {toast.message}
    </motion.div>
  )
}
