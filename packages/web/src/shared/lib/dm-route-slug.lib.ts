/**
 * DM URL slug helpers — canonical participant ids and sidebar-compatible slugs.
 */
import { dmRouteKey } from "~/shared/lib/dm-key";
import { compareUserIds, isIamUserUuid, type UserId, userIdsEqual } from "~/shared/lib/user-id.lib";

const DM_SLUG_CACHE_LIMIT = 200;
const dmSlugUserIdsCache = new Map<string, UserId[]>();

const IAM_UUID_SLUG_PREFIX_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.*)?$/i;

function slugifyDmParticipantName(name: string): string {
  const lower = name.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "user";
}

function parseIamUuidFromSlugSegment(trimmed: string): string | null {
  const uuidMatch = IAM_UUID_SLUG_PREFIX_RE.exec(trimmed);
  if (uuidMatch?.[1] != null && isIamUserUuid(uuidMatch[1])) {
    return uuidMatch[1].toLowerCase();
  }
  return isIamUserUuid(trimmed) ? trimmed.toLowerCase() : null;
}

function parseSingleDmRouteSegment(segment: string): UserId | null {
  const trimmed = segment.trim();
  if (trimmed.length === 0) return null;

  const iamUuid = parseIamUuidFromSlugSegment(trimmed);
  if (iamUuid != null) {
    return iamUuid;
  }

  const DECIMAL_INTEGER_RE = /^\d+$/;
  const dashIndex = trimmed.indexOf("-");
  const numericPrefix = (dashIndex >= 0 ? trimmed.slice(0, dashIndex) : trimmed).trim();
  if (DECIMAL_INTEGER_RE.test(numericPrefix)) {
    const parsed = Number(numericPrefix);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  if (DECIMAL_INTEGER_RE.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Parse DM slug from URL: "422-vasya" -> [422], "uuid-alice" -> [uuid]. */
export function parseDmRouteParticipantIds(dmSlug: string): UserId[] {
  const cached = dmSlugUserIdsCache.get(dmSlug);
  if (cached != null) {
    return cached;
  }

  const parsedUserIds = dmSlug
    .split(",")
    .map(parseSingleDmRouteSegment)
    .filter((userId): userId is UserId => userId != null);

  if (dmSlugUserIdsCache.size >= DM_SLUG_CACHE_LIMIT) {
    dmSlugUserIdsCache.clear();
  }
  dmSlugUserIdsCache.set(dmSlug, parsedUserIds);
  return parsedUserIds;
}

/** Builds `/dm/:slug` segment aligned with sidebar DM entries (`id-name` or group list). */
export function buildDmRouteSlugFromRecipients(
  recipients: readonly { id: UserId; full_name?: string }[],
  currentUserId: UserId | null,
): string | null {
  if (recipients.length === 0) return null;

  const sorted = [...recipients].sort((left, right) => compareUserIds(left.id, right.id));
  const others =
    currentUserId != null
      ? sorted.filter((recipient) => !userIdsEqual(recipient.id, currentUserId))
      : sorted;
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
  currentUserId: UserId | null,
): boolean {
  if (activeDmRouteSlug == null || activeDmRouteSlug.length === 0) return false;
  if (chatSlug === activeDmRouteSlug) return true;

  const routeUserIds = parseDmRouteParticipantIds(activeDmRouteSlug);
  const chatUserIds = parseDmRouteParticipantIds(chatSlug);
  if (routeUserIds.length === 0 || chatUserIds.length === 0) return false;

  return dmRouteKey(routeUserIds, currentUserId) === dmRouteKey(chatUserIds, currentUserId);
}
