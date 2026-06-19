/**
 * Narrow builders for POST /messages/flags/narrow (sidebar mark-all-read only).
 */
import { guard } from "~/shared/lib/guards";
import {
  normalizeMessengerMessagesNarrowForApi,
  type MessengerMessagesNarrowClause,
  messengerTopicNarrowOperandForApi,
} from "~/shared/lib/messenger-topic-narrow.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export const IS_UNREAD_NARROW_CLAUSE: MessengerMessagesNarrowClause = {
  operator: "is",
  operand: "unread",
  negated: false,
};

/** Sidebar DM mark-read: is:unread + dm. */
export function buildSidebarMarkReadNarrowForDm(
  userIds: number[],
): MessengerMessagesNarrowClause[] {
  const validatedUserIds = guard
    .nonEmptyArray(userIds, "buildSidebarMarkReadNarrowForDm.userIds")
    .map((userId) => guard.userId(userId, "buildSidebarMarkReadNarrowForDm.userIds"));
  return normalizeMessengerMessagesNarrowForApi([
    IS_UNREAD_NARROW_CLAUSE,
    { operator: "dm", operand: validatedUserIds },
  ]);
}

/** Sidebar stream mark-read: is:unread + channel (whole stream). */
export function buildSidebarMarkReadNarrowForChannel(
  streamId: number,
  useStreamOperator = false,
): MessengerMessagesNarrowClause[] {
  guard.streamId(streamId, "buildSidebarMarkReadNarrowForChannel");
  const channelOperator = useStreamOperator ? "stream" : "channel";
  return normalizeMessengerMessagesNarrowForApi([
    IS_UNREAD_NARROW_CLAUSE,
    { operator: channelOperator, operand: streamId },
  ]);
}

/** Sidebar topic mark-read: is:unread + channel + topic. */
export function buildSidebarMarkReadNarrowForTopic(
  streamId: number,
  topic: string,
  useStreamOperator = false,
): MessengerMessagesNarrowClause[] {
  guard.streamId(streamId, "buildSidebarMarkReadNarrowForTopic");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const channelOperator = useStreamOperator ? "stream" : "channel";
  return normalizeMessengerMessagesNarrowForApi([
    IS_UNREAD_NARROW_CLAUSE,
    { operator: channelOperator, operand: streamId },
    { operator: "topic", operand: messengerTopicNarrowOperandForApi(normalizedTopic) },
  ]);
}
