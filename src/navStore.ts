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
  /** Target weight (kg) the plate calculator sheet is open for; null = closed. */
  plateCalcKg: number | null
  openPlateCalc: (kg: number) => void
  closePlateCalc: () => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
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
  plateCalcKg: null,
  openPlateCalc: (kg) => set({ plateCalcKg: kg }),
  closePlateCalc: () => set({ plateCalcKg: null }),
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}))
