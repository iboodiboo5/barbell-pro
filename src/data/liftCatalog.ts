import { db } from './db'
import type { Lift } from './db'

/** Lowercase, trim, collapse internal whitespace runs to single spaces. */
export function normalizeLiftName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Classic dynamic-programming Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  // prev[j] = distance(a[0..i-1], b[0..j-1])
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr: number[] = [i]
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
      }
    }
    prev = curr
  }
  return prev[n]
}

/**
 * Resolve a raw lift name to a Lift record:
 *  1. Exact match on normalized name or normalized alias.
 *  2. Fuzzy match: levenshtein <= 2 AND both strings length >= 6; pick smallest distance.
 *     On match, push the normalized variant into aliases and persist.
 *  3. Create new record.
 */
export async function resolveLift(rawName: string): Promise<Lift> {
  const norm = normalizeLiftName(rawName)
  const all = await db.lifts.toArray()

  // 1. Exact match (case-insensitive via normalize)
  for (const lift of all) {
    if (normalizeLiftName(lift.name) === norm) return lift
    if (lift.aliases.some(a => normalizeLiftName(a) === norm)) return lift
  }

  // 2. Fuzzy match — only when both candidate and query are >= 6 chars
  if (norm.length >= 6) {
    let bestLift: Lift | null = null
    let bestDist = Infinity

    for (const lift of all) {
      const candidateNorm = normalizeLiftName(lift.name)
      if (candidateNorm.length >= 6) {
        const d = levenshtein(norm, candidateNorm)
        if (d <= 2 && d < bestDist) {
          bestDist = d
          bestLift = lift
        }
      }
      // Also check existing aliases
      for (const alias of lift.aliases) {
        const aliasNorm = normalizeLiftName(alias)
        if (aliasNorm.length >= 6) {
          const d = levenshtein(norm, aliasNorm)
          if (d <= 2 && d < bestDist) {
            bestDist = d
            bestLift = lift
          }
        }
      }
    }

    if (bestLift !== null) {
      // Add normalized variant as alias if not already present
      if (!bestLift.aliases.some(a => normalizeLiftName(a) === norm)) {
        const updated: Lift = {
          ...bestLift,
          aliases: [...bestLift.aliases, norm],
          updatedAt: Date.now(),
        }
        await db.lifts.put(updated)
        return updated
      }
      return bestLift
    }
  }

  // 3. Create new lift
  const lift: Lift = {
    id: crypto.randomUUID(),
    name: rawName.trim(),
    aliases: [],
    updatedAt: Date.now(),
  }
  await db.lifts.add(lift)
  return lift
}

/**
 * Case-insensitive prefix+substring search on name and aliases.
 * Prefix matches ranked before substring-only matches.
 * Empty or whitespace-only query returns [].
 */
export async function searchLifts(query: string): Promise<Lift[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const all = await db.lifts.toArray()
  const prefixMatches: Lift[] = []
  const substringMatches: Lift[] = []

  for (const lift of all) {
    const nameLower = lift.name.toLowerCase()
    const isPrefix = nameLower.startsWith(q) ||
      lift.aliases.some(a => a.toLowerCase().startsWith(q))
    const isSubstring = !isPrefix && (
      nameLower.includes(q) ||
      lift.aliases.some(a => a.toLowerCase().includes(q))
    )
    if (isPrefix) prefixMatches.push(lift)
    else if (isSubstring) substringMatches.push(lift)
  }

  return [...prefixMatches, ...substringMatches]
}
