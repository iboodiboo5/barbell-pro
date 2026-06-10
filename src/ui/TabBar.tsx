import { motion } from 'motion/react'
import { useNavStore, type Tab } from '../navStore'

interface TabConfig {
  id: Tab
  label: string
  icon: React.ReactNode
}

const tabs: TabConfig[] = [
  {
    id: 'train',
    label: 'Train',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'lifts',
    label: 'Lifts',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 5v14" />
        <path d="M18 5v14" />
        <path d="M3 8h3" />
        <path d="M18 8h3" />
        <path d="M3 16h3" />
        <path d="M18 16h3" />
        <path d="M6 12h12" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
]

export function TabBar() {
  const { tab, setTab } = useNavStore()

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'stretch',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--surface-frost)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'var(--safe-bottom)',
        zIndex: 100,
        height: 'calc(64px + var(--safe-bottom))',
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            aria-label={t.label}
            aria-current={active ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-faint)',
              position: 'relative',
              paddingBottom: 4,
              transition: 'color 0.15s',
            }}
          >
            {t.icon}
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{t.label}</span>
            {active && (
              <motion.span
                layoutId="tab-dot"
                style={{
                  position: 'absolute',
                  bottom: 6,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
