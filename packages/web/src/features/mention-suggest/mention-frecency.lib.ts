/**
 * Mention frecency — how often and how recently you picked someone from the "@" dropdown.
 *
 * Counts decay with a half-life, so a person you mentioned daily last year does not
 * outrank the one you mention this week. Stored per organization in localStorage;
 * losing the store only costs ranking quality, never correctness.
 */

import {
  buildOrgScopedStorageKey,
  getActiveOrganizationIdFromStorage,
} from "~/shared/lib/org-scoped-storage";

const STORAGE_KEY = "workspace-mention-frecency";
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;
/** Below this a decayed entry no longer changes any order, so it is dropped. */
const MIN_KEPT_SCORE = 0.05;

interface MentionFrecencyEntry {
  count: number;
  lastUsedAt: number;
}

type MentionFrecencyStore = Record<string, MentionFrecencyEntry>;

function resolveStorageKey(): string {
  return buildOrgScopedStorageKey(STORAGE_KEY, getActiveOrganizationIdFromStorage());
}

function decay(count: number, ageMs: number): number {
  if (count <= 0) return 0;
  if (ageMs <= 0) return count;
  return count * Math.pow(2, -ageMs / HALF_LIFE_MS);
}

function isEntry(value: unknown): value is MentionFrecencyEntry {
  if (typeof value !== "object" || value == null) return false;
  const entry = value as Partial<MentionFrecencyEntry>;
  return (
    typeof entry.count === "number" &&
    Number.isFinite(entry.count) &&
    entry.count > 0 &&
    typeof entry.lastUsedAt === "number" &&
    Number.isFinite(entry.lastUsedAt)
  );
}

function readStore(): MentionFrecencyStore {
  try {
    const raw = window.localStorage.getItem(resolveStorageKey());
    if (raw == null || raw.length === 0) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed == null) return {};
    const store: MentionFrecencyStore = {};
    for (const [userUuid, entry] of Object.entries(parsed)) {
      if (isEntry(entry)) store[userUuid] = entry;
    }
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: MentionFrecencyStore): void {
  try {
    window.localStorage.setItem(resolveStorageKey(), JSON.stringify(store));
  } catch {
    /* quota exceeded or restricted storage */
  }
}

/** Records one pick, folding the previous count through its decay first. */
export function recordMentionPick(userUuid: string, now: number = Date.now()): void {
  if (typeof window === "undefined" || userUuid.length === 0) return;

  const store = readStore();
  const previous = store[userUuid];
  const decayed = previous == null ? 0 : decay(previous.count, now - previous.lastUsedAt);
  store[userUuid] = { count: decayed + 1, lastUsedAt: now };

  const entries = Object.entries(store)
    .map(([uuid, entry]) => ({ uuid, entry, score: decay(entry.count, now - entry.lastUsedAt) }))
    .filter(({ score }) => score >= MIN_KEPT_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_ENTRIES);

  writeStore(Object.fromEntries(entries.map(({ uuid, entry }) => [uuid, entry])));
}

/** Decayed score per user, ready to be fed into mention ranking. */
export function loadMentionFrecency(now: number = Date.now()): Record<string, number> {
  if (typeof window === "undefined") return {};

  const scores: Record<string, number> = {};
  for (const [userUuid, entry] of Object.entries(readStore())) {
    const score = decay(entry.count, now - entry.lastUsedAt);
    if (score >= MIN_KEPT_SCORE) scores[userUuid] = score;
  }
  return scores;
}
