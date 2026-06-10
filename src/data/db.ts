import Dexie, { type Table } from 'dexie'

export interface Week { id: string; label: string; order: number; updatedAt: number }
export interface Day { id: string; weekId: string; name: string; date?: string; order: number; updatedAt: number }
export interface Exercise {
  id: string; dayId: string; liftId: string
  plannedLoad: number; plannedSets: number; plannedReps: number
  // verbatim coach-sheet values when they aren't plain kg / integer ("30lb", "AMRAP @7-8")
  loadText?: string; repsText?: string
  remarks: string[]; order: number; updatedAt: number
}
export interface SetLog {
  id: string; exerciseId: string; liftId: string; dayId: string
  weight: number; reps: number; completedAt: number; isWarmup: boolean; updatedAt: number
}
export interface Lift { id: string; name: string; aliases: string[]; updatedAt: number }
export interface Note { id: string; text: string; createdAt: number; updatedAt: number }
export interface BodyWeightEntry { id: string; weightKg: number; date: string; updatedAt: number }
export interface Settings {
  id: 'app'
  units: 'kg' | 'lbs'
  sex: 'male' | 'female'
  barWeightKg: number
  platesKg: number[]            // available plate denominations per side
  sound: boolean
  haptics: boolean
  restDefaultSec: number
  consistencyTargetPerWeek: number
  consistencyStartDate: string  // ISO date
  updatedAt: number
}
export interface LiveSession {
  id: string; dayId: string; startedAt: number
  currentExerciseIndex: number; finishedAt?: number; updatedAt: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app', units: 'kg', sex: 'male', barWeightKg: 20,
  platesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  sound: true, haptics: true, restDefaultSec: 150,
  consistencyTargetPerWeek: 4,
  consistencyStartDate: new Date().toISOString().slice(0, 10),
  updatedAt: 0,
}

export class BarbellDB extends Dexie {
  weeks!: Table<Week, string>
  days!: Table<Day, string>
  exercises!: Table<Exercise, string>
  setLogs!: Table<SetLog, string>
  lifts!: Table<Lift, string>
  notes!: Table<Note, string>
  bodyWeights!: Table<BodyWeightEntry, string>
  settings!: Table<Settings, string>
  liveSessions!: Table<LiveSession, string>

  constructor() {
    super('barbellPro')
    this.version(1).stores({
      weeks: 'id, order',
      days: 'id, weekId, order',
      exercises: 'id, dayId, liftId, order',
      setLogs: 'id, exerciseId, liftId, dayId, completedAt',
      lifts: 'id, name',
      notes: 'id, createdAt',
      bodyWeights: 'id, date',
      settings: 'id',
      liveSessions: 'id, dayId',
    })
  }
}

export const db = new BarbellDB()
