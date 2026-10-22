const STORAGE_KEY = "workspace-message-quick-reactions:v1";
const USAGE_WINDOW_DAYS = 7;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

type DailyReactionCounts = Record<string, number>;
type ReactionUsageByDay = Record<string, DailyReactionCounts>;

let cachedUsageByDay: ReactionUsageByDay | null = null;
let usageRevision = 0;
const usageListeners = new Set<() => void>();

function notifyUsageChanged(): void {
  usageRevision += 1;
  for (const listener of usageListeners) listener();
}

export function subscribeWorkspaceMessageQuickReactionUsage(listener: () => void): () => void {
  usageListeners.add(listener);
  return () => usageListeners.delete(listener);
}

export function getWorkspaceMessageQuickReactionUsageRevision(): number {
  return usageRevision;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isUtcDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && getUtcDateKey(new Date(timestamp)) === value;
}

function parseUsageByDay(value: unknown): ReactionUsageByDay {
  if (!isRecord(value) || !isRecord(value.days)) return {};

  const usageByDay: ReactionUsageByDay = {};
  for (const [dateKey, rawDailyCounts] of Object.entries(value.days)) {
    if (!isUtcDateKey(dateKey) || !isRecord(rawDailyCounts)) continue;

    const dailyCounts = Object.fromEntries(
      Object.entries(rawDailyCounts).filter(
        ([emojiName, count]) =>
          emojiName.trim().length > 0 &&
          typeof count === "number" &&
          Number.isSafeInteger(count) &&
          count > 0,
      ),
    ) as DailyReactionCounts;
    if (Object.keys(dailyCounts).length > 0) usageByDay[dateKey] = dailyCounts;
  }

  return usageByDay;
}

function readUsageByDay(): ReactionUsageByDay {
  if (cachedUsageByDay != null) return cachedUsageByDay;
  if (typeof window === "undefined") {
    cachedUsageByDay = {};
    return cachedUsageByDay;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    cachedUsageByDay = rawValue == null ? {} : parseUsageByDay(JSON.parse(rawValue) as unknown);
  } catch {
    cachedUsageByDay = {};
  }

  return cachedUsageByDay;
}

function getWindowStartDateKey(now: Date): string {
  const todayStart = Date.parse(`${getUtcDateKey(now)}T00:00:00.000Z`);
  return getUtcDateKey(new Date(todayStart - (USAGE_WINDOW_DAYS - 1) * DAY_MILLISECONDS));
}

function getRecentUsageByDay(now: Date): ReactionUsageByDay {
  const today = getUtcDateKey(now);
  const windowStart = getWindowStartDateKey(now);
  return Object.fromEntries(
    Object.entries(readUsageByDay()).filter(
      ([dateKey]) => dateKey >= windowStart && dateKey <= today,
    ),
  );
}

export function getWorkspaceMessageQuickReactionUsageCounts(
  now = new Date(),
): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const dailyCounts of Object.values(getRecentUsageByDay(now))) {
    for (const [emojiName, count] of Object.entries(dailyCounts)) {
      counts.set(emojiName, (counts.get(emojiName) ?? 0) + count);
    }
  }
  return Object.fromEntries(counts);
}

export function recordWorkspaceMessageQuickReactionUse(emojiName: string, now = new Date()): void {
  const normalizedEmojiName = emojiName.trim();
  if (normalizedEmojiName.length === 0) return;

  const recentUsage = getRecentUsageByDay(now);
  const today = getUtcDateKey(now);
  const todayCounts = recentUsage[today] ?? {};
  const nextUsage: ReactionUsageByDay = {
    ...recentUsage,
    [today]: Object.fromEntries([
      ...Object.entries(todayCounts),
      [normalizedEmojiName, (todayCounts[normalizedEmojiName] ?? 0) + 1],
    ]),
  };
  cachedUsageByDay = nextUsage;
  notifyUsageChanged();

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: nextUsage }));
  } catch {
    // Reaction tracking is optional and must not block the reaction action.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key == null) {
      cachedUsageByDay = null;
      notifyUsageChanged();
    }
  });
}
