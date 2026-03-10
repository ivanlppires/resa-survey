import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Don't show if dismissed recently (24h)
    const dismissed = localStorage.getItem('resa_install_dismissed')
    if (dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000) return

    // Detect iOS
    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(isiOS)

    if (isiOS) {
      // iOS doesn't have beforeinstallprompt — show custom guide
      const isInStandalone = ('standalone' in navigator) && (navigator as unknown as { standalone: boolean }).standalone
      if (!isInStandalone) {
        setTimeout(() => setShowBanner(true), 2000)
      }
      return
    }

    // Android / Chrome: listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setShowBanner(true), 1500)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowBanner(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setShowIOSGuide(false)
    localStorage.setItem('resa_install_dismissed', String(Date.now()))
  }

  if (!showBanner) return null

  // iOS guide modal
  if (isIOS && showIOSGuide) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="w-full max-w-lg bg-apple-card rounded-t-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4">
              <h3 className="text-[18px] font-bold text-apple-text text-center">Instalar RESA Survey</h3>
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-apple-blue/12 text-apple-blue text-[14px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <p className="text-[15px] text-apple-text">
                    Toque no botão <span className="inline-flex items-center align-middle mx-0.5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E7CE6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> <strong>Compartilhar</strong> no Safari
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-apple-blue/12 text-apple-blue text-[14px] font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <p className="text-[15px] text-apple-text">
                    Role e toque em <strong>"Adicionar à Tela de Início"</strong>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-apple-blue/12 text-apple-blue text-[14px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <p className="text-[15px] text-apple-text">
                    Toque em <strong>"Adicionar"</strong> para confirmar
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={handleDismiss}
                className="w-full h-12 rounded-xl bg-apple-text/5 text-[16px] font-semibold text-apple-text hover:bg-apple-text/8 transition-colors"
                style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                Entendi
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    )
  }

  // Bottom banner (Android + iOS initial)
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50"
      >
        <div className="max-w-lg mx-auto bg-apple-card rounded-t-2xl shadow-[0_-4px_40px_rgba(0,0,0,0.12)] px-5 pt-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px) + 44px)' }}>
          <div className="flex items-center gap-3.5 mb-4">
            <img src="/icon-192.png" alt="RESA" className="w-14 h-14 rounded-2xl flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)]" />
            <div className="min-w-0">
              <p className="text-[17px] font-bold text-apple-text">RESA Survey</p>
              <p className="text-[14px] text-apple-secondary mt-0.5">Acesse offline direto da tela inicial</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={handleDismiss}
              className="flex-1 h-12 rounded-xl bg-apple-text/5 text-[15px] font-semibold text-apple-secondary hover:bg-apple-text/8 transition-colors"
            >
              Agora não
            </button>
            <button
              onClick={isIOS ? () => setShowIOSGuide(true) : handleInstall}
              className="flex-1 h-12 rounded-xl bg-apple-green text-white text-[15px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_8px_rgba(34,163,82,0.3)]"
            >
              Instalar
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
