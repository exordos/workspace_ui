/**
 * Builds Workspace web app message permalinks (`#narrow/.../near/id`) for reply quotes.
 *
 * Mirrors Workspace web `people.pm_perma_link` + stream topic URLs (channel + topic + near).
 * See: https://github.com/messenger/messenger/blob/main/web/src/people.ts (pm_perma_link)
 */
import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";

// Workspace `internal_url.encodeHashComponent` — browsers decode hash aggressively.
const HASH_REPLACEMENTS = new Map<string, string>([
  ["%", "."],
  ["!", ".21"],
  ["'", ".27"],
  ["(", ".28"],
  [")", ".29"],
  ["*", ".2A"],
  [".", ".2E"],
]);

/** Encodes a string for use in Workspace `#narrow` hash operands. */
export function encodeWorkspaceHashComponent(str: string): string {
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

function buildPrivateNarrowHash(userIds: number[], messageId: MessageId): string {
  const suffix = userIds.length >= 3 ? "group" : "dm";
  const slug = `${userIds.join(",")}-${suffix}`;
  return `#narrow/dm/${slug}/near/${encodeWorkspaceHashComponent(String(messageId))}`;
}

function buildStreamNarrowHash(streamUuid: string, topic: string, messageId: MessageId): string {
  const streamSlug = encodeWorkspaceHashComponent(streamUuid.trim().toLowerCase());
  const topicEnc = encodeWorkspaceHashComponent(topic);
  const nearEnc = encodeWorkspaceHashComponent(String(messageId));
  return `#narrow/channel/${streamSlug}/topic/${topicEnc}/near/${nearEnc}`;
}

/**
 * Returns full `https://realm/#narrow/...` for opening the message in Workspace web, or `null` if it cannot be built.
 */
export function buildMessengerMessageWebPermalink(
  realmBaseUrl: string,
  message: Pick<MockMessage, "id" | "stream_uuid" | "subject" | "topic_uuid" | "display_recipient">,
  resolveStreamName: (streamUuid: string) => string | undefined,
): string | null {
  const origin = normalizeRealmOrigin(realmBaseUrl);
  if (origin == null) return null;

  const messageId = message.id;
  if (message.stream_uuid != null) {
    resolveStreamName(message.stream_uuid);
    const topic = (message.topic_uuid ?? message.subject ?? "").trim();
    if (topic.length === 0) return null;
    const hash = buildStreamNarrowHash(message.stream_uuid, topic, messageId);
    return `${origin}/${hash}`;
  }

  const userIds = privateRecipientUserIds(message.display_recipient);
  if (userIds == null) return null;
  const hash = buildPrivateNarrowHash(userIds, messageId);
  return `${origin}/${hash}`;
}
