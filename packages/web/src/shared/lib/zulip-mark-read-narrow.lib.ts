/**
 * Narrow builders for POST /messages/flags/narrow (sidebar mark-all-read only).
 */
import { guard } from "~/shared/lib/guards";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  normalizeZulipMessagesNarrowForApi,
  type ZulipMessagesNarrowClause,
  zulipTopicNarrowOperandForApi,
} from "~/shared/lib/zulip-topic-narrow.lib";

export const IS_UNREAD_NARROW_CLAUSE: ZulipMessagesNarrowClause = {
  operator: "is",
  operand: "unread",
  negated: false,
};

/** Sidebar DM mark-read: is:unread + dm. */
export function buildSidebarMarkReadNarrowForDm(userIds: number[]): ZulipMessagesNarrowClause[] {
  const validatedUserIds = guard
    .nonEmptyArray(userIds, "buildSidebarMarkReadNarrowForDm.userIds")
    .map((userId) => guard.userId(userId, "buildSidebarMarkReadNarrowForDm.userIds"));
  return normalizeZulipMessagesNarrowForApi([
    IS_UNREAD_NARROW_CLAUSE,
    { operator: "dm", operand: validatedUserIds },
  ]);
}

/** Sidebar stream mark-read: is:unread + channel (whole stream). */
export function buildSidebarMarkReadNarrowForChannel(
  streamId: number,
  useStreamOperator = false,
): ZulipMessagesNarrowClause[] {
  guard.streamId(streamId, "buildSidebarMarkReadNarrowForChannel");
  const channelOperator = useStreamOperator ? "stream" : "channel";
  return normalizeZulipMessagesNarrowForApi([
    IS_UNREAD_NARROW_CLAUSE,
    { operator: channelOperator, operand: streamId },
  ]);
}

/** Sidebar topic mark-read: is:unread + channel + topic. */
export function buildSidebarMarkReadNarrowForTopic(
  streamId: number,
  topic: string,
  useStreamOperator = false,
): ZulipMessagesNarrowClause[] {
  guard.streamId(streamId, "buildSidebarMarkReadNarrowForTopic");
  const normalizedTopic = normalizeTopicForIdentity(topic);
  const channelOperator = useStreamOperator ? "stream" : "channel";
  return normalizeZulipMessagesNarrowForApi([
    IS_UNREAD_NARROW_CLAUSE,
    { operator: channelOperator, operand: streamId },
    { operator: "topic", operand: zulipTopicNarrowOperandForApi(normalizedTopic) },
  ]);
}
