import { repo } from '../data/repo'

export interface FeedbackSettings {
  sound: boolean
  haptics: boolean
}

// Module-level cache so haptics/sound can gate synchronously inside
// pointer handlers without awaiting IndexedDB.
let cache: FeedbackSettings = { sound: true, haptics: true }

export function getFeedbackSettings(): FeedbackSettings {
  return cache
}

/**
 * The ONLY way to change the sound/haptics flags. Updates the synchronous
 * module cache immediately AND persists to the settings store, so the cache
 * and db can never drift apart. Do not call repo.updateSettings directly
 * for these two flags.
 */
export function setFeedbackSettings(patch: { sound?: boolean; haptics?: boolean }): void {
  cache = { ...cache, ...patch }
  void repo.updateSettings(patch)
}

/** Re-reads { sound, haptics } from settings. For full reloads (e.g. backup import). */
export async function refreshFeedbackSettings(): Promise<FeedbackSettings> {
  try {
    const s = await repo.getSettings()
    cache = { sound: s.sound, haptics: s.haptics }
  } catch {
    // DB unavailable — keep last known values.
  }
  return cache
}

// Prime the cache once on module load (browser only; harmless if it races,
// defaults match DEFAULT_SETTINGS).
if (typeof window !== 'undefined') {
  void refreshFeedbackSettings()
}
