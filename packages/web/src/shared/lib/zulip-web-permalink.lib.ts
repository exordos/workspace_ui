/**
 * Builds Zulip web app message permalinks (`#narrow/.../near/id`) for reply quotes.
 *
 * Mirrors Zulip web `people.pm_perma_link` + stream topic URLs (channel + topic + near).
 * See: https://github.com/zulip/zulip/blob/main/web/src/people.ts (pm_perma_link)
 */
import type { MockMessage } from "~/shared/api/zulip.types";

// Zulip `internal_url.encodeHashComponent` — browsers decode hash aggressively.
const HASH_REPLACEMENTS = new Map<string, string>([
  ["%", "."],
  ["!", ".21"],
  ["'", ".27"],
  ["(", ".28"],
  [")", ".29"],
  ["*", ".2A"],
  [".", ".2E"],
]);

/** Encodes a string for use in Zulip `#narrow` hash operands. */
export function encodeZulipHashComponent(str: string): string {
  return encodeURIComponent(str).replaceAll(
    /[%!'()*.]/g,
    (matched) => HASH_REPLACEMENTS.get(matched) ?? matched,
  );
}

function normalizeRealmOrigin(realmBaseUrl: string): string | null {
  const t = realmBaseUrl.trim();
  if (t.length === 0) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withProto).origin;
  } catch {
    return null;
  }
}

function streamIdToZulipSlug(streamId: number, streamName: string): string {
  const name = streamName.trim().replaceAll(" ", "-");
  return `${streamId}-${name}`;
}

function privateRecipientUserIds(
  displayRecipient: MockMessage["display_recipient"],
): number[] | null {
  if (
    displayRecipient == null ||
    typeof displayRecipient === "string" ||
    displayRecipient.length === 0
  ) {
    return null;
  }
  return [...displayRecipient.map((r) => r.id)].sort((a, b) => a - b);
}

function buildPrivateNarrowHash(userIds: number[], messageId: number): string {
  const suffix = userIds.length >= 3 ? "group" : "dm";
  const slug = `${userIds.join(",")}-${suffix}`;
  return `#narrow/dm/${slug}/near/${encodeZulipHashComponent(String(messageId))}`;
}

function buildStreamNarrowHash(
  streamId: number,
  streamName: string,
  topic: string,
  messageId: number,
): string {
  const streamSlug = encodeZulipHashComponent(streamIdToZulipSlug(streamId, streamName));
  const topicEnc = encodeZulipHashComponent(topic);
  const nearEnc = encodeZulipHashComponent(String(messageId));
  return `#narrow/channel/${streamSlug}/topic/${topicEnc}/near/${nearEnc}`;
}

/**
 * Returns full `https://realm/#narrow/...` for opening the message in Zulip web, or `null` if it cannot be built.
 */
export function buildZulipMessageWebPermalink(
  realmBaseUrl: string,
  message: Pick<MockMessage, "id" | "stream_id" | "subject" | "display_recipient">,
  resolveStreamName: (streamId: number) => string | undefined,
): string | null {
  const origin = normalizeRealmOrigin(realmBaseUrl);
  if (origin == null) return null;

  const messageId = message.id;
  if (message.stream_id != null) {
    const name = resolveStreamName(message.stream_id) ?? "unknown";
    const topic = (message.subject ?? "").trim();
    const hash = buildStreamNarrowHash(message.stream_id, name, topic, messageId);
    return `${origin}/${hash}`;
  }

  const userIds = privateRecipientUserIds(message.display_recipient);
  if (userIds == null) return null;
  const hash = buildPrivateNarrowHash(userIds, messageId);
  return `${origin}/${hash}`;
}
