/**
 * DM URL slug helpers — canonical participant ids and sidebar-compatible slugs.
 */
import { dmRouteKey } from "~/shared/lib/dm-key";

const DM_SLUG_CACHE_LIMIT = 200;
const dmSlugUserIdsCache = new Map<string, number[]>();

function slugifyDmParticipantName(name: string): string {
  const lower = name.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "user";
}

/** Parse DM slug from URL: "422-vasya" -> [422], "422-vasya,507-petya" -> [422, 507]. */
export function parseDmRouteParticipantIds(dmSlug: string): number[] {
  const cached = dmSlugUserIdsCache.get(dmSlug);
  if (cached != null) {
    return cached;
  }

  const DECIMAL_INTEGER_RE = /^\d+$/;
  const parsedUserIds = dmSlug
    .split(",")
    .map((part) => part.split("-")[0]?.trim() ?? "")
    .map((rawUserId) => {
      if (!DECIMAL_INTEGER_RE.test(rawUserId)) return null;
      const parsed = Number(rawUserId);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
      return parsed;
    })
    .filter((userId): userId is number => userId !== null);

  if (dmSlugUserIdsCache.size >= DM_SLUG_CACHE_LIMIT) {
    dmSlugUserIdsCache.clear();
  }
  dmSlugUserIdsCache.set(dmSlug, parsedUserIds);
  return parsedUserIds;
}

/** Builds `/dm/:slug` segment aligned with sidebar DM entries (`id-name` or group list). */
export function buildDmRouteSlugFromRecipients(
  recipients: readonly { id: number; full_name?: string }[],
  currentUserId: number | null,
): string | null {
  if (recipients.length === 0) return null;

  const sorted = [...recipients].sort((a, b) => a.id - b.id);
  const others =
    currentUserId != null ? sorted.filter((recipient) => recipient.id !== currentUserId) : sorted;
  const targets = others.length > 0 ? others : sorted;

  if (targets.length === 1) {
    const user = targets[0]!;
    return `${user.id}-${slugifyDmParticipantName(user.full_name ?? "")}`;
  }

  return targets
    .map((user) => `${user.id}-${slugifyDmParticipantName(user.full_name ?? "")}`)
    .join(",");
}

/** True when route DM slug and sidebar chat slug refer to the same conversation. */
export function isDmRouteSlugActive(
  chatSlug: string,
  activeDmRouteSlug: string | null | undefined,
  currentUserId: number | null,
): boolean {
  if (activeDmRouteSlug == null || activeDmRouteSlug.length === 0) return false;

  const routeUserIds = parseDmRouteParticipantIds(activeDmRouteSlug);
  const chatUserIds = parseDmRouteParticipantIds(chatSlug);
  if (routeUserIds.length === 0 || chatUserIds.length === 0) return false;

  return dmRouteKey(routeUserIds, currentUserId) === dmRouteKey(chatUserIds, currentUserId);
}
