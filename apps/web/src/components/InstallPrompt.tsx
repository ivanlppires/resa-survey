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
  const [isInstalled, setIsInstalled] = useState(true)
  const [showMiniButton, setShowMiniButton] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = ('standalone' in navigator) && (navigator as unknown as { standalone: boolean }).standalone
    if (standalone || iosStandalone) {
      setIsInstalled(true)
      return
    }
    setIsInstalled(false)

    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = isiOS && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua)
    setIsIOS(isSafari)

    const dismissed = localStorage.getItem('resa_install_dismissed')
    const recentlyDismissed = dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000

    if (recentlyDismissed) {
      setShowMiniButton(true)
      return
    }

    if (isSafari) {
      setTimeout(() => setShowBanner(true), 2000)
      return
    }

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
        setShowMiniButton(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setShowIOSGuide(false)
    setShowMiniButton(true)
    localStorage.setItem('resa_install_dismissed', String(Date.now()))
  }

  const handleMiniClick = () => {
    if (isIOS) {
      setShowIOSGuide(true)
      setShowBanner(true)
    } else {
      setShowBanner(true)
    }
    setShowMiniButton(false)
  }

  if (isInstalled) return null

  // Mini floating button (when banner was dismissed)
  if (showMiniButton && !showBanner) {
    return (
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.5 }}
        onClick={handleMiniClick}
        className="fixed bottom-20 left-4 md:bottom-6 md:right-6 md:left-auto z-40 w-10 h-10 rounded-full bg-apple-card/80 backdrop-blur-lg shadow-[0_2px_12px_rgba(0,0,0,0.1)] flex items-center justify-center text-apple-secondary hover:text-apple-text hover:bg-apple-card transition-colors safe-bottom"
        title="Instalar app"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </motion.button>
    )
  }

  if (!showBanner) return null

  // iOS guide modal (always bottom sheet)
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

  // Desktop: compact toast (bottom-right)
  // Mobile: full-width bottom sheet
  return (
    <AnimatePresence>
      {/* Mobile bottom sheet */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      >
        <div className="max-w-lg mx-auto bg-apple-card rounded-t-2xl shadow-[0_-4px_40px_rgba(0,0,0,0.12)] px-5 pt-6" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px) + 44px)' }}>
          <div className="flex flex-col items-center text-center mb-5">
            <img src="/icon-192.png" alt="RESA" className="w-16 h-16 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.1)] mb-3" />
            <p className="text-[18px] font-bold text-apple-text">RESA Survey</p>
            <p className="text-[14px] text-apple-secondary mt-1 leading-snug">Instale o app para acessar offline<br />direto da tela inicial</p>
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

      {/* Desktop toast */}
      <motion.div
        initial={{ x: 80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-6 right-6 z-50 hidden md:block"
      >
        <div className="w-[380px] bg-apple-card rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-apple-text/5 flex items-center justify-center text-apple-tertiary hover:text-apple-text hover:bg-apple-text/10 transition-colors z-10"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
          <div className="p-5">
            <div className="flex items-center gap-4">
              <img src="/icon-192.png" alt="RESA" className="w-12 h-12 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex-shrink-0" />
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-[15px] font-bold text-apple-text">Instalar RESA Survey</p>
                <p className="text-[13px] text-apple-secondary mt-0.5 leading-snug">Acesse offline como um app nativo no seu computador</p>
              </div>
            </div>
            <div className="flex gap-2.5 mt-4">
              <button
                onClick={handleDismiss}
                className="flex-1 h-10 rounded-xl bg-apple-text/5 text-[14px] font-semibold text-apple-secondary hover:bg-apple-text/8 transition-colors"
              >
                Agora não
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 h-10 rounded-xl bg-apple-green text-white text-[14px] font-semibold hover:bg-apple-green-hover transition-colors shadow-[0_2px_8px_rgba(34,163,82,0.25)]"
              >
                Instalar
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
