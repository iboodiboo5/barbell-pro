import { create } from 'zustand'

export type Tab = 'train' | 'lifts' | 'stats' | 'notes'

interface NavState {
  tab: Tab
  setTab: (tab: Tab) => void
  liftDetailId: string | null
  openLift: (id: string) => void
  closeLift: () => void
  liveActive: boolean
  liveDayId: string | null
  startLive: (dayId: string) => void
  endLive: () => void
}

export const useNavStore = create<NavState>((set) => ({
  tab: 'train',
  setTab: (tab) => set({ tab }),
  liftDetailId: null,
  openLift: (id) => set({ liftDetailId: id }),
  closeLift: () => set({ liftDetailId: null }),
  liveActive: false,
  liveDayId: null,
  startLive: (dayId) => set({ liveActive: true, liveDayId: dayId }),
  endLive: () => set({ liveActive: false, liveDayId: null }),
}))
