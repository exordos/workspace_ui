/**
 * Builds the conversation context that orders @mention suggestions.
 *
 * Reads only what the messenger and message stores already hold: who wrote in the
 * open conversation, who belongs to the stream, and who you talk to directly.
 */

import type { WorkspaceMessageStoreData } from "~/entities/message/message.model.types";
import type { MessengerStoreState } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import type { MentionRankingContext } from "~/features/mention-suggest/mention-suggest.types";

/** Reading deeper than this into the loaded window costs more than it reorders. */
const RECENT_MESSAGE_SCAN_DEPTH = 200;
const RECENT_AUTHOR_LIMIT = 20;
const DM_PARTNER_LIMIT = 20;

export type MentionContextMessengerState = Pick<
  MessengerStoreState,
  | "streamIds"
  | "streamsById"
  | "streamBindingsById"
  | "streamBindingIdsByStreamId"
  | "streamBindingsLoadedByStreamId"
>;

export type MentionContextMessageState = Pick<
  WorkspaceMessageStoreData,
  "conversationWindowsById" | "messagesById"
>;

export interface WorkspaceMentionContextInput {
  streamUuid?: MessengerUuid | null;
  conversationId?: string | null;
  selfUserUuid?: MessengerUuid | null;
  messenger: MentionContextMessengerState;
  messages: MentionContextMessageState;
  frecencyByUserUuid?: Readonly<Record<string, number>>;
}

function resolveChannelMemberUuids(
  streamUuid: MessengerUuid | null | undefined,
  messenger: MentionContextMessengerState,
): ReadonlySet<MessengerUuid> | null {
  if (streamUuid == null || streamUuid.length === 0) return null;
  // Membership that has not arrived yet must not be reported as "outside the channel".
  if (messenger.streamBindingsLoadedByStreamId[streamUuid] !== true) return null;

  const memberUuids = new Set<MessengerUuid>();
  for (const bindingUuid of messenger.streamBindingIdsByStreamId[streamUuid] ?? []) {
    const userUuid = messenger.streamBindingsById[bindingUuid]?.userUuid;
    if (userUuid != null && userUuid.length > 0) memberUuids.add(userUuid);
  }
  return memberUuids;
}

function resolveRecentAuthorUuids(
  conversationId: string | null | undefined,
  messages: MentionContextMessageState,
): MessengerUuid[] {
  if (conversationId == null || conversationId.length === 0) return [];

  const messageUuids = messages.conversationWindowsById[conversationId]?.messageUuids ?? [];
  const authorUuids: MessengerUuid[] = [];
  const seen = new Set<MessengerUuid>();
  const scanStart = Math.max(0, messageUuids.length - RECENT_MESSAGE_SCAN_DEPTH);

  // The window is ordered oldest first, so the newest authors come from the tail.
  for (let index = messageUuids.length - 1; index >= scanStart; index -= 1) {
    const messageUuid = messageUuids[index];
    if (messageUuid == null) continue;
    const authorUuid = messages.messagesById[messageUuid]?.authorUuid;
    if (authorUuid == null || authorUuid.length === 0 || seen.has(authorUuid)) continue;
    seen.add(authorUuid);
    authorUuids.push(authorUuid);
    if (authorUuids.length >= RECENT_AUTHOR_LIMIT) break;
  }

  return authorUuids;
}

function resolveLastActivityAt(
  lastMessageUuid: MessengerUuid | null | undefined,
  messagesById: Readonly<Record<MessengerUuid, MessengerMessage>>,
  fallback: string,
): string {
  if (lastMessageUuid == null) return fallback;
  return messagesById[lastMessageUuid]?.createdAt ?? fallback;
}

function resolveDmPartnerUuids(
  messenger: MentionContextMessengerState,
  messages: MentionContextMessageState,
): MessengerUuid[] {
  const partners: { userUuid: MessengerUuid; lastActivityAt: string }[] = [];
  const seen = new Set<MessengerUuid>();

  for (const streamUuid of messenger.streamIds) {
    const stream = messenger.streamsById[streamUuid];
    const partnerUuid = stream?.directUserUuid;
    if (stream == null || partnerUuid == null || partnerUuid.length === 0) continue;
    if (seen.has(partnerUuid)) continue;
    seen.add(partnerUuid);
    partners.push({
      userUuid: partnerUuid,
      lastActivityAt: resolveLastActivityAt(
        stream.lastMessageUuid,
        messages.messagesById,
        stream.updatedAt,
      ),
    });
  }

  const byLastActivity = partners.toSorted((left, right) =>
    right.lastActivityAt.localeCompare(left.lastActivityAt),
  );
  return byLastActivity.slice(0, DM_PARTNER_LIMIT).map(({ userUuid }) => userUuid);
}

export function buildWorkspaceMentionContext({
  streamUuid,
  conversationId,
  selfUserUuid,
  messenger,
  messages,
  frecencyByUserUuid,
}: WorkspaceMentionContextInput): MentionRankingContext {
  return {
    selfUserUuid: selfUserUuid ?? null,
    channelMemberUuids: resolveChannelMemberUuids(streamUuid, messenger),
    recentAuthorUuids: resolveRecentAuthorUuids(conversationId, messages),
    dmPartnerUuids: resolveDmPartnerUuids(messenger, messages),
    ...(frecencyByUserUuid != null ? { frecencyByUserUuid } : {}),
  };
}
