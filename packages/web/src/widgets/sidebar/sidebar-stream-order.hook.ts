import { useState } from "react";
import {
  selectMessengerSidebarStreamSortActivity,
  sortMessengerSidebarStreams,
  type MessengerSidebarSortMode,
  type MessengerSidebarStreamsState,
  type MessengerSidebarStreamSortActivity,
} from "~/entities/messenger/messenger-sidebar.lib";
import { isMessengerTopicListItemActive } from "~/entities/messenger/messenger-topic-list.lib";
import type {
  MessengerMessage,
  MessengerSidebarStreamItem,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";

interface SidebarStreamOrderInput {
  listKey: string;
  streams: MessengerSidebarStreamItem[];
  streamsById: MessengerSidebarStreamsState["streamsById"];
  topicsById: MessengerSidebarStreamsState["topicsById"];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  sortMode: MessengerSidebarSortMode;
}

interface StreamOrderHold extends MessengerSidebarStreamSortActivity {
  completedTopicUuids: ReadonlySet<MessengerUuid>;
  topicMessageUuids: ReadonlyMap<MessengerUuid, MessengerUuid | null>;
  streamLastMessageUuid: MessengerUuid | null;
}

interface StreamOrderSnapshot {
  input: SidebarStreamOrderInput;
  holds: ReadonlyMap<MessengerUuid, StreamOrderHold>;
  streams: MessengerSidebarStreamItem[];
}

function createHold(
  stream: MessengerSidebarStreamItem,
  previous: SidebarStreamOrderInput,
  completedTopicUuids: ReadonlySet<MessengerUuid>,
): StreamOrderHold {
  return {
    ...selectMessengerSidebarStreamSortActivity(stream, previous.streamsById),
    completedTopicUuids,
    streamLastMessageUuid: previous.streamsById[stream.streamUuid]?.lastMessageUuid ?? null,
    topicMessageUuids: new Map(
      stream.topics.map((topic) => [
        topic.topicUuid,
        previous.topicsById[topic.topicUuid]?.lastMessageUuid ?? null,
      ]),
    ),
  };
}

function hasNewActiveMessage(
  stream: MessengerSidebarStreamItem,
  hold: StreamOrderHold,
  input: SidebarStreamOrderInput,
): boolean {
  // Resolve the original pointers again: hydrating an old message is not new activity.
  const originalMessageAt =
    hold.streamLastMessageUuid == null
      ? null
      : input.messagesById[hold.streamLastMessageUuid]?.createdAt;
  const latestBefore =
    originalMessageAt != null &&
    (hold.lastMessageCreatedAt == null || originalMessageAt > hold.lastMessageCreatedAt)
      ? originalMessageAt
      : hold.lastMessageCreatedAt;
  return stream.topics.some((topic) => {
    if (!isMessengerTopicListItemActive(topic, stream.notificationMode)) return false;
    const uuid = input.topicsById[topic.topicUuid]?.lastMessageUuid;
    if (uuid == null || uuid === hold.topicMessageUuids.get(topic.topicUuid)) return false;
    const message = input.messagesById[uuid];
    return message != null && (latestBefore == null || message.createdAt >= latestBefore);
  });
}

function observeInactiveMessages(
  stream: MessengerSidebarStreamItem,
  hold: StreamOrderHold,
  input: SidebarStreamOrderInput,
): StreamOrderHold {
  let updated: Map<MessengerUuid, MessengerUuid | null> | undefined;
  for (const topic of stream.topics) {
    if (isMessengerTopicListItemActive(topic, stream.notificationMode)) continue;
    const uuid = input.topicsById[topic.topicUuid]?.lastMessageUuid ?? null;
    if (uuid === hold.topicMessageUuids.get(topic.topicUuid)) continue;
    updated ??= new Map(hold.topicMessageUuids);
    updated.set(topic.topicUuid, uuid);
  }
  // Re-enabling notifications must not turn earlier muted activity into a new message.
  return updated == null ? hold : { ...hold, topicMessageUuids: updated };
}

function reconcileStreamOrder(
  previous: StreamOrderSnapshot,
  input: SidebarStreamOrderInput,
): StreamOrderSnapshot {
  const holds = new Map<MessengerUuid, StreamOrderHold>();
  if (previous.input.listKey !== input.listKey || previous.input.sortMode !== input.sortMode) {
    return { input, holds, streams: input.streams };
  }
  if (previous.holds.size === 0 && previous.input.topicsById === input.topicsById) {
    return { input, holds: previous.holds, streams: input.streams };
  }

  const previousStreams = new Map(
    previous.input.streams.map((stream) => [stream.streamUuid, stream]),
  );
  for (const stream of input.streams) {
    const previousStream = previousStreams.get(stream.streamUuid);
    if (previousStream == null) continue;
    let hold = previous.holds.get(stream.streamUuid);
    const previousTopics = new Map(previousStream.topics.map((topic) => [topic.topicUuid, topic]));
    const completed = stream.topics.filter((topic) => {
      const before = previousTopics.get(topic.topicUuid);
      return (
        topic.isDone &&
        before != null &&
        isMessengerTopicListItemActive(before, previousStream.notificationMode)
      );
    });
    if (completed.length > 0) {
      const completedTopicUuids = new Set([
        ...(hold?.completedTopicUuids ?? []),
        ...completed.map((topic) => topic.topicUuid),
      ]);
      hold =
        hold == null
          ? createHold(previousStream, previous.input, completedTopicUuids)
          : { ...hold, completedTopicUuids };
    }
    if (
      hold == null ||
      [...hold.completedTopicUuids].some((uuid) => input.topicsById[uuid]?.isDone !== true)
    )
      continue;
    hold = observeInactiveMessages(stream, hold, input);
    if (hasNewActiveMessage(stream, hold, input)) continue;
    holds.set(stream.streamUuid, hold);
  }
  const unchanged =
    holds.size === previous.holds.size &&
    [...holds].every(([uuid, hold]) => previous.holds.get(uuid) === hold);
  const nextHolds = unchanged ? previous.holds : holds;
  return {
    input,
    holds: nextHolds,
    streams: sortMessengerSidebarStreams(
      input.streams,
      input.sortMode,
      input.streamsById,
      nextHolds,
      previous.streams,
    ),
  };
}

/** Keep completion from lowering a stream during this visit to the list. */
export function useSidebarStreamOrder(
  input: SidebarStreamOrderInput,
): MessengerSidebarStreamItem[] {
  const [snapshot, setSnapshot] = useState<StreamOrderSnapshot>(() => ({
    input,
    holds: new Map(),
    streams: input.streams,
  }));
  let current = snapshot;
  if (
    snapshot.input.listKey !== input.listKey ||
    snapshot.input.sortMode !== input.sortMode ||
    snapshot.input.streams !== input.streams ||
    snapshot.input.streamsById !== input.streamsById ||
    snapshot.input.topicsById !== input.topicsById ||
    snapshot.input.messagesById !== input.messagesById
  ) {
    // Adjust before rendering children so the canonical reorder never flashes on screen.
    current = reconcileStreamOrder(snapshot, input);
    setSnapshot(current);
  }
  return current.streams;
}
