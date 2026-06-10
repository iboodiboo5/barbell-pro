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

/** Re-reads { sound, haptics } from settings. Call after the settings sheet mutates them. */
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
