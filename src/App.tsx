import { lazy, Suspense, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavStore } from './navStore'
import { TabBar } from './ui/TabBar'
import { TrainTab } from './features/train/TrainTab'
import { PlateCalcSheet } from './features/plate-calc/PlateCalcSheet'
import { SettingsSheet } from './features/settings/SettingsSheet'
import { ToastHost } from './ui/Toast'

// Dev-only kitchen sink (Task 7) — removed in Task 15. Lazy so it never
// lands in the production bundle.
const DevGallery = import.meta.env.DEV
  ? lazy(() => import('./ui/DevGallery').then((m) => ({ default: m.DevGallery })))
  : null

const tabVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

const transition = { duration: 0.18 }

function TabContent() {
  const { tab } = useNavStore()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tab}
        variants={tabVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        style={{
          minHeight: '100dvh',
          paddingBottom: 'calc(64px + var(--safe-bottom))',
          paddingTop: 'var(--safe-top)',
        }}
      >
        {tab === 'train' && <TrainTab />}
        {tab === 'lifts' && <div />}
        {tab === 'stats' && <div />}
        {tab === 'notes' && <div />}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const [devOpen, setDevOpen] = useState(false)

  return (
    <>
      {devOpen && DevGallery ? (
        <div
          style={{
            minHeight: '100dvh',
            paddingBottom: 'calc(64px + var(--safe-bottom))',
            paddingTop: 'var(--safe-top)',
          }}
        >
          <Suspense fallback={null}>
            <DevGallery />
          </Suspense>
        </div>
      ) : (
        <TabContent />
      )}
      {import.meta.env.DEV && (
        <button
          onClick={() => setDevOpen((v) => !v)}
          aria-label="Toggle dev gallery"
          style={{
            position: 'fixed',
            top: 'calc(12px + var(--safe-top))',
            right: 12,
            zIndex: 400,
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            background: devOpen ? 'var(--accent)' : 'var(--surface-2)',
            color: devOpen ? 'var(--text)' : 'var(--text-dim)',
            border: '1px solid var(--border-strong)',
            cursor: 'pointer',
          }}
        >
          DEV
        </button>
      )}
      <PlateCalcSheet />
      <SettingsSheet />
      <TabBar />
      <ToastHost />
    </>
  )
}
