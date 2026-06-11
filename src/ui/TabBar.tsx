import { motion } from 'motion/react'
import { useNavStore, type Tab } from '../navStore'

interface TabConfig {
  id: Tab
  label: string
  /** The hero tab — rendered as a raised accent circle in the middle. */
  center?: boolean
  icon: React.ReactNode
}

const tabs: TabConfig[] = [
  {
    id: 'profile',
    label: 'Profile',
    // person
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20.5c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5" />
      </svg>
    ),
  },
  {
    id: 'train',
    label: 'Train',
    center: true,
    // barbell with plates
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7.5 12h9" />
        <path d="M5.5 7v10" />
        <path d="M2.5 9v6" />
        <path d="M18.5 7v10" />
        <path d="M21.5 9v6" />
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

        if (t.center) {
          // Hero tab: raised accent circle that floats above the bar.
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
                justifyContent: 'flex-start',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                padding: 0,
              }}
            >
              <motion.span
                initial={false}
                animate={{ scale: active ? 1 : 0.92, y: -14 }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'var(--text)',
                  border: '4px solid var(--bg)',
                  boxShadow: active
                    ? '0 8px 24px var(--accent-soft)'
                    : '0 4px 14px rgba(0, 0, 0, .4)',
                }}
              >
                {t.icon}
              </motion.span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--accent)' : 'var(--text-faint)',
                  marginTop: -8,
                }}
              >
                {t.label}
              </span>
            </button>
          )
        }

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
