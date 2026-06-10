import type { SetLog } from '../data/db'

export const epley1RM = (weight: number, reps: number) =>
  reps <= 1 ? weight : weight * (1 + reps / 30)

const working = (logs: SetLog[]) => logs.filter(s => !s.isWarmup && s.reps > 0 && s.weight > 0)

export function bestForReps(logs: SetLog[], reps: number): number | null {
  const eligible = working(logs).filter(s => s.reps >= reps)
  return eligible.length ? Math.max(...eligible.map(s => s.weight)) : null
}

export interface PRs { oneRM: number | null; threeRM: number | null; fiveRM: number | null; est1RM: number | null }
export function computePRs(logs: SetLog[]): PRs {
  const w = working(logs)
  return {
    oneRM: bestForReps(w, 1), threeRM: bestForReps(w, 3), fiveRM: bestForReps(w, 5),
    est1RM: w.length ? Math.max(...w.map(s => epley1RM(s.weight, s.reps))) : null,
  }
}

export function isNewPR(history: SetLog[], candidate: SetLog): boolean {
  if (candidate.isWarmup || candidate.reps <= 0 || candidate.weight <= 0) return false
  const prior = bestForReps(history, candidate.reps)
  return prior === null || candidate.weight > prior
}

const DOTS = {
  male:   { a: -307.75076,  b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093 },
  female: { a: -57.96288,   b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706 },
}
export function dotsScore(totalKg: number, bodyWeightKg: number, sex: 'male' | 'female'): number {
  const { a, b, c, d, e } = DOTS[sex]
  const x = bodyWeightKg
  return (totalKg * 500) / (a + b * x + c * x ** 2 + d * x ** 3 + e * x ** 4)
}
