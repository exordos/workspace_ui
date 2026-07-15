/**
 * Recent DM partner persistence.
 *
 * Saves the last 50 DM partner user IDs to localStorage so the DM list order
 * is preserved across sessions (Flutter parity).
 */

import { isIamUserUuid, userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";

const RECENT_DM_KEY = "recent_dm_partners";
const MAX_RECENT = 50;

export function saveRecentDmPartners(userIds: UserId[]): void {
  try {
    localStorage.setItem(
      RECENT_DM_KEY,
      JSON.stringify(userIds.filter(isIamUserUuid).map(userIdStorageKey).slice(0, MAX_RECENT)),
    );
  } catch {
    /* quota exceeded or restricted storage */
  }
}

export function loadRecentDmPartners(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_DM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isIamUserUuid).map(userIdStorageKey).slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}
