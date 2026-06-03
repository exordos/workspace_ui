type PresenceStatus = "active" | "idle";

export type UserPickerPresence = "active" | "idle" | "offline" | null;

const ACTIVE_PRESENCE_WINDOW_SECONDS = 2 * 60;
const IDLE_PRESENCE_WINDOW_SECONDS = 10 * 60;

export interface UserPickerOption {
  userId: number;
  fullName: string;
  email: string;
  presence: UserPickerPresence;
  statusLabel: string | null;
  isDisabled: boolean;
}

export interface UserPickerCandidate {
  userId: number;
  fullName: string;
  email?: string;
  presenceStatus?: PresenceStatus;
  presenceTimestamp?: number;
  statusLabel?: string | null;
}

function normalizeSearchValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(candidate: UserPickerCandidate, query: string): boolean {
  if (query.length === 0) return true;
  const normalizedName = normalizeSearchValue(candidate.fullName);
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
  selectedUserIds: readonly number[];
  excludedUserIds?: readonly number[];
  query?: string;
}): UserPickerOption[] {
  const { candidates, selectedUserIds, excludedUserIds = [], query = "" } = options;
  const normalizedQuery = query.trim().toLowerCase();
  const selected = new Set(selectedUserIds);
  const excluded = new Set(excludedUserIds);
  const now = Math.floor(Date.now() / 1000);

  const deduped = new Map<number, UserPickerOption>();
  for (const candidate of candidates) {
    if (deduped.has(candidate.userId)) {
      continue;
    }
    if (excluded.has(candidate.userId)) {
      continue;
    }
    const fullName = candidate.fullName.trim();
    if (fullName.length === 0) {
      continue;
    }
    if (!matchesQuery(candidate, normalizedQuery)) {
      continue;
    }

    const statusLabel = candidate.statusLabel?.trim();

    deduped.set(candidate.userId, {
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
    const leftSelected = selected.has(left.userId) ? 0 : 1;
    const rightSelected = selected.has(right.userId) ? 0 : 1;
    if (leftSelected !== rightSelected) {
      return leftSelected - rightSelected;
    }
    return left.fullName.localeCompare(right.fullName);
  });
  return rows;
}

export function toggleUserPickerSelection(
  selectedUserIds: readonly number[],
  userId: number,
): number[] {
  const next = new Set(selectedUserIds);
  if (next.has(userId)) {
    next.delete(userId);
  } else {
    next.add(userId);
  }
  return Array.from(next).sort((a, b) => a - b);
}
