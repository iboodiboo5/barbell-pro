import { AnimatePresence, motion } from 'motion/react'
import { useNavStore } from './navStore'
import { TabBar } from './ui/TabBar'

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
        {tab === 'train' && <div />}
        {tab === 'lifts' && <div />}
        {tab === 'stats' && <div />}
        {tab === 'notes' && <div />}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <>
      <TabContent />
      <TabBar />
    </>
  )
}
