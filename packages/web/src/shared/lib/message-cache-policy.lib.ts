/**
 * Pure helpers for IndexedDB message window policy (gap checks, retention math).
 *
 * Zulip message ids are monotonic but not necessarily consecutive integers; use these
 * helpers only for test scenarios with known consecutive ids or ordering checks.
 */

/** True if ids are strictly increasing (no duplicates). */
export function isStrictlyIncreasingUniqueIds(ids: readonly number[]): boolean {
  for (let i = 1; i < ids.length; i++) {
    if (ids[i]! <= ids[i - 1]!) return false;
  }
  return true;
}

/**
 * For a sorted ascending list of consecutive integers, returns true if any step is not +1.
 * Use in tests when message ids are synthetic consecutive values.
 */
export function hasConsecutiveIntegerGap(sortedAscending: readonly number[]): boolean {
  if (sortedAscending.length < 2) return false;
  for (let i = 1; i < sortedAscending.length; i++) {
    if (sortedAscending[i]! !== sortedAscending[i - 1]! + 1) return true;
  }
  return false;
}
