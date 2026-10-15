type PresenceStatus = "active" | "idle";

export type UserPickerId = number | string;
export type UserPickerPresence = "active" | "idle" | "offline" | null;

const ACTIVE_PRESENCE_WINDOW_SECONDS = 2 * 60;
const IDLE_PRESENCE_WINDOW_SECONDS = 10 * 60;

export interface UserPickerOption<TId extends UserPickerId = UserPickerId> {
  userId: TId;
  fullName: string;
  username?: string;
  email: string;
  presence: UserPickerPresence;
  statusLabel: string | null;
  isDisabled: boolean;
}

export interface UserPickerCandidate<TId extends UserPickerId = UserPickerId> {
  userId: TId;
  fullName: string;
  username?: string;
  email?: string;
  presence?: UserPickerPresence;
  presenceStatus?: PresenceStatus;
  presenceTimestamp?: number;
  statusLabel?: string | null;
}

export function userPickerSearchText(
  user: Pick<UserPickerCandidate, "fullName" | "username" | "email">,
): string {
  return [user.fullName, user.username, user.email].filter(Boolean).join("\n");
}

export function matchesUserPickerQuery(
  candidate: Pick<UserPickerCandidate, "fullName" | "username" | "email">,
  query: string,
): boolean {
  return userPickerSearchText(candidate).toLowerCase().includes(query.trim().toLowerCase());
}

function toPresence(
  status: PresenceStatus | undefined,
  timestamp: number | undefined,
  nowUnixSeconds: number,
): UserPickerPresence {
  if (status == null) return null;
  if (timestamp == null) return status;
  const diff = nowUnixSeconds - timestamp;
  if (status === "active" && diff <= ACTIVE_PRESENCE_WINDOW_SECONDS) {
    return "active";
  }
  if (diff <= IDLE_PRESENCE_WINDOW_SECONDS) {
    return "idle";
  }
  return "offline";
}

export function buildUserPickerOptions<TId extends UserPickerId>(options: {
  candidates: readonly UserPickerCandidate<TId>[];
  selectedUserIds: readonly TId[];
  excludedUserIds?: readonly TId[];
  query?: string;
}): UserPickerOption<TId>[] {
  const { candidates, selectedUserIds, excludedUserIds = [], query = "" } = options;
  const normalizedQuery = query.trim().toLowerCase();
  const selected = new Set(selectedUserIds);
  const excluded = new Set(excludedUserIds);
  const now = Math.floor(Date.now() / 1000);

  const deduped = new Map<TId, UserPickerOption<TId>>();
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
    if (!matchesUserPickerQuery(candidate, normalizedQuery)) {
      continue;
    }

    const statusLabel = candidate.statusLabel?.trim();

    deduped.set(candidate.userId, {
      userId: candidate.userId,
      fullName,
      ...(candidate.username != null ? { username: candidate.username.trim() } : {}),
      email: (candidate.email ?? "").trim(),
      presence:
        candidate.presence ??
        toPresence(candidate.presenceStatus, candidate.presenceTimestamp, now),
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

export function toggleUserPickerSelection<TId extends UserPickerId>(
  selectedUserIds: readonly TId[],
  userId: TId,
): TId[] {
  const next = new Set(selectedUserIds);
  if (next.has(userId)) {
    next.delete(userId);
  } else {
    next.add(userId);
  }
  return Array.from(next).sort((left, right) => {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  });
}
