import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavStore } from './navStore'
import { TabBar } from './ui/TabBar'
import { TrainTab } from './features/train/TrainTab'
import { PlateCalcSheet } from './features/plate-calc/PlateCalcSheet'
import { SettingsSheet } from './features/settings/SettingsSheet'
import { LiveWorkout } from './features/live/LiveWorkout'
import { useLiveStore } from './features/live/liveStore'
import { LiftsTab } from './features/lifts/LiftsTab'
import { LiftDetail } from './features/lifts/LiftDetail'
import { NotesTab } from './features/notes/NotesTab'
import { ToastHost } from './ui/Toast'

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
        {tab === 'lifts' && <LiftsTab />}
        {tab === 'notes' && <NotesTab />}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const liveActive = useNavStore((s) => s.liveActive)
  const liftDetailId = useNavStore((s) => s.liftDetailId)

  // Resume an interrupted live session on launch (app killed mid-workout).
  useEffect(() => {
    void useLiveStore.getState().resumeIfActive().then((resumed) => {
      if (resumed) {
        const session = useLiveStore.getState().session
        if (session) useNavStore.getState().startLive(session.dayId)
      }
    })
  }, [])

  return (
    <>
      <TabContent />
      <AnimatePresence>{liveActive && <LiveWorkout />}</AnimatePresence>
      <AnimatePresence>{liftDetailId && <LiftDetail liftId={liftDetailId} />}</AnimatePresence>
      <PlateCalcSheet />
      <SettingsSheet />
      <TabBar />
      <ToastHost />
    </>
  )
}
