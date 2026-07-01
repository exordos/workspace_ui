import type { WorkspaceUserPresenceStatus } from "~/shared/api/messenger.types";
import type { UserId } from "~/shared/lib/user-id.lib";
import { compareUserIds, userIdStorageKey } from "~/shared/lib/user-id.lib";

type PresenceStatus = WorkspaceUserPresenceStatus;

export type UserPickerPresence = WorkspaceUserPresenceStatus | null;

const ACTIVE_PRESENCE_WINDOW_SECONDS = 2 * 60;
const IDLE_PRESENCE_WINDOW_SECONDS = 10 * 60;

export interface UserPickerOption {
  userId: UserId;
  fullName: string;
  email: string;
  presence: UserPickerPresence;
  statusLabel: string | null;
  isDisabled: boolean;
}

export interface UserPickerCandidate {
  userId: UserId;
  fullName: string;
  email?: string;
  presenceStatus?: PresenceStatus;
  presenceTimestamp?: number;
  statusLabel?: string | null;
}

function normalizeSearchValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveDisplayName(candidate: UserPickerCandidate): string {
  const fullName = candidate.fullName.trim();
  if (fullName.length > 0) {
    return fullName;
  }
  const email = (candidate.email ?? "").trim();
  if (email.length > 0) {
    return email;
  }
  return userIdStorageKey(candidate.userId);
}

function matchesQuery(candidate: UserPickerCandidate, query: string): boolean {
  if (query.length === 0) return true;
  const normalizedName = normalizeSearchValue(resolveDisplayName(candidate));
  const normalizedEmail = normalizeSearchValue(candidate.email);
  return normalizedName.includes(query) || normalizedEmail.includes(query);
}

function toPresence(
  status: PresenceStatus | undefined,
  timestamp: number | undefined,
  nowUnixSeconds: number,
): UserPickerPresence {
  if (status == null || timestamp == null) return null;
  const diff = nowUnixSeconds - timestamp;
  if (status === "offline") {
    return "offline";
  }
  if (status === "do_not_disturb" && diff <= ACTIVE_PRESENCE_WINDOW_SECONDS) {
    return "do_not_disturb";
  }
  if (status === "active" && diff <= ACTIVE_PRESENCE_WINDOW_SECONDS) {
    return "active";
  }
  if (diff <= IDLE_PRESENCE_WINDOW_SECONDS) {
    return "idle";
  }
  return "offline";
}

export function buildUserPickerOptions(options: {
  candidates: readonly UserPickerCandidate[];
  selectedUserIds: readonly UserId[];
  excludedUserIds?: readonly UserId[];
  query?: string;
}): UserPickerOption[] {
  const { candidates, selectedUserIds, excludedUserIds = [], query = "" } = options;
  const normalizedQuery = query.trim().toLowerCase();
  const selected = new Set(selectedUserIds.map(userIdStorageKey));
  const excluded = new Set(excludedUserIds.map(userIdStorageKey));
  const now = Math.floor(Date.now() / 1000);

  const deduped = new Map<string, UserPickerOption>();
  for (const candidate of candidates) {
    const key = userIdStorageKey(candidate.userId);
    if (deduped.has(key)) {
      continue;
    }
    if (excluded.has(key)) {
      continue;
    }
    if (!matchesQuery(candidate, normalizedQuery)) {
      continue;
    }

    const fullName = resolveDisplayName(candidate);
    const statusLabel = candidate.statusLabel?.trim();

    deduped.set(key, {
      userId: candidate.userId,
      fullName,
      email: (candidate.email ?? "").trim(),
      presence: toPresence(candidate.presenceStatus, candidate.presenceTimestamp, now),
      statusLabel: statusLabel != null && statusLabel.length > 0 ? statusLabel : null,
      isDisabled: false,
    });
  }

  const rows = Array.from(deduped.values());
  rows.sort((left, right) => {
    const leftSelected = selected.has(userIdStorageKey(left.userId)) ? 0 : 1;
    const rightSelected = selected.has(userIdStorageKey(right.userId)) ? 0 : 1;
    if (leftSelected !== rightSelected) {
      return leftSelected - rightSelected;
    }
    return left.fullName.localeCompare(right.fullName);
  });
  return rows;
}

/** i18n key for an empty user picker (see `dm.*` and `search.noResults`). */
export function resolveUserPickerEmptyLabelKey(options: {
  candidateCount: number;
  visibleCount: number;
  query: string;
  excludesCurrentUser: boolean;
}): string {
  const { candidateCount, visibleCount, query, excludesCurrentUser } = options;
  if (visibleCount > 0) {
    return "search.noResults";
  }
  if (candidateCount === 0) {
    return "dm.usersDirectoryEmpty";
  }
  if (query.trim().length > 0) {
    return "search.noResults";
  }
  if (excludesCurrentUser && candidateCount === 1) {
    return "dm.noOtherUsers";
  }
  return "search.noResults";
}

export function toggleUserPickerSelection(
  selectedUserIds: readonly UserId[],
  userId: UserId,
): UserId[] {
  const targetKey = userIdStorageKey(userId);
  const next = selectedUserIds.filter((id) => userIdStorageKey(id) !== targetKey);
  if (next.length === selectedUserIds.length) {
    next.push(userId);
  }
  return next.sort(compareUserIds);
}
