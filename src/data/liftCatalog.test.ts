import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { normalizeLiftName, levenshtein, resolveLift } from './liftCatalog'

beforeEach(async () => { await db.lifts.clear() })

describe('normalizeLiftName', () => {
  it('lowercases, trims, collapses whitespace', () => {
    expect(normalizeLiftName('  Bench   Press ')).toBe('bench press')
  })
})

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('deadlift', 'deadlfit')).toBe(2)
    expect(levenshtein('squat', 'squat')).toBe(0)
  })
})

describe('resolveLift', () => {
  it('creates a lift when none exists', async () => {
    const l = await resolveLift('Deadlift')
    expect(l.name).toBe('Deadlift')
    expect(await db.lifts.count()).toBe(1)
  })
  it('matches existing lift case-insensitively', async () => {
    const a = await resolveLift('Deadlift')
    const b = await resolveLift('deadlift')
    expect(b.id).toBe(a.id)
  })
  it('fuzzy-matches typos within distance 2 and records alias', async () => {
    const a = await resolveLift('Deadlift')
    const b = await resolveLift('Deadlfit')
    expect(b.id).toBe(a.id)
    expect((await db.lifts.get(a.id))!.aliases).toContain('deadlfit')
  })
  it('does NOT merge distinct short names', async () => {
    const row = await resolveLift('Row')
    const rdl = await resolveLift('RDL')
    expect(rdl.id).not.toBe(row.id)
  })
})
